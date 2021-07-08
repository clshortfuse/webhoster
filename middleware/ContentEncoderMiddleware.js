import { Transform } from 'stream';
import { createBrotliCompress, createDeflate, createGzip } from 'zlib';

import { parseQualityValues } from '../utils/qualityValues.js';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/** @typedef {'br'|'gzip'|'deflate'|'identity'|'*'} COMPATIBLE_ENCODING */

const DEFAULT_MINIMUM_SIZE = 256;

/**
 * @typedef ContentEncoderMiddlewareOptions
 * @prop {number} [chunkSize]
 * @prop {boolean} [respondNotAcceptable=false]
 * @prop {'br'|'gzip'|'deflate'|'identity'} [preferredEncoding='identity']
 * @prop {number} [minimumSize=DEFAULT_MINIMUM_SIZE]
 */

/** @type {COMPATIBLE_ENCODING[]} */
const COMPATIBLE_ENCODINGS = ['br', 'gzip', 'deflate', 'identity', '*'];

/** @implements {IMiddleware} */
export default class ContentEncoderMiddleware {
  /** @param {ContentEncoderMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.chunkSize = options.chunkSize;
    this.respondNotAcceptable = options.respondNotAcceptable === true;
    this.preferredEncoding = options.preferredEncoding ?? 'identity';
    this.minimumSize = options.minimumSize ?? DEFAULT_MINIMUM_SIZE;
  }

  /**
   * @param {import('../types/index.js').HttpRequest} req
   * @throws {NotAcceptableException} Error with `NOT_ACCEPTIBLE` message
   * @return {COMPATIBLE_ENCODING}
   */
  static chooseEncoding(req) {
  /**
   * A request without an Accept-Encoding header field implies that the
   * user agent has no preferences regarding content-codings.  Although
   * this allows the server to use any content-coding in a response, it
   * does not imply that the user agent will be able to correctly process
   * all encodings.
   */
    if ('accept-encoding' in req.headers === false) {
      return '*';
    }

    /** @type {string} */
    const acceptString = (req.headers['accept-encoding']);
    const encodings = parseQualityValues(acceptString?.toLowerCase());
    if (!encodings.size) {
    /**
     * An Accept-Encoding header field with a combined field-value that is
     * empty implies that the user agent does not want any content-coding in
     * response.
     */
      return 'identity';
    }
    let encoding = COMPATIBLE_ENCODINGS[0];
    const allowWildcards = (encodings.get('*')?.q !== 0);
    const encodingEntries = [...encodings.entries()];
    // @ts-ignore Cannot cast to COMPATIBLE_ENCODINGS
    encoding = (encodingEntries.find(([value, spec]) => spec.q !== 0 && COMPATIBLE_ENCODINGS.includes(value))?.[0]);
    if (allowWildcards && (encoding === '*' || !encoding)) {
    // Server preference
    // Get first compatible encoding not specified
      encoding = COMPATIBLE_ENCODINGS.find((value) => !encodings.has(value));
    }
    if (allowWildcards && !encoding) {
    // Get highest q'd compatible encoding not q=0 or '*'
    // @ts-ignore Cannot cast to COMPATIBLE_ENCODINGS
      encoding = encodingEntries
      // @ts-ignore Cannot cast to COMPATIBLE_ENCODINGS
        .find(([value, spec]) => spec.q !== 0 && value !== '*' && COMPATIBLE_ENCODINGS.includes(value))?.[0];
    }
    if (!encoding) {
      throw new Error('NOT_ACCEPTABLE');
    }
    return encoding;
  }

  /**
   * Implements `Accept-Encoding`
   * https://tools.ietf.org/html/rfc7231#section-5.3.4
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req, res }) {
    if (req.method === 'HEAD') {
    // Never needs content-encoding
      return 'continue';
    }

    /** @type {COMPATIBLE_ENCODING} */
    let parsedEncoding;
    if (this.respondNotAcceptable) {
    // Parse now to catch the error;
      try {
        parsedEncoding = ContentEncoderMiddleware.chooseEncoding(req);
      } catch (error) {
        if (error?.message === 'NOT_ACCEPTABLE') {
          res.status = 406;
          return 'end';
        }
        // Unknown error
        throw error;
      }
    }

    /** @return {string} */
    const getContentEncoding = () => {
      if (!parsedEncoding) {
        try {
          parsedEncoding = ContentEncoderMiddleware.chooseEncoding(req);
        } catch (error) {
          if (error?.message !== 'NOT_ACCEPTABLE') {
            throw error;
          }
        }
      }
      if (!parsedEncoding || parsedEncoding === '*') {
        parsedEncoding = this.preferredEncoding || 'identity';
      }
      res.headers['content-encoding'] = parsedEncoding;
      return parsedEncoding;
    };

    let finalCalled = false;
    let transformCount = 0;
    let inputLength = 0;
    const newStream = new Transform({
      transform(chunk, encoding, callback) {
        transformCount += 1;
        inputLength += chunk.length;
        // Stall to see if more chunks are in transit
        process.nextTick(() => {
          this.push(chunk);
        });
        callback();
      },
      final(callback) {
        finalCalled = true;
        callback();
      },
    });
    const destination = res.replaceStream(newStream);

    /**
     * @param {'br'|'gzip'|'deflate'} encoding
     * @return {import("zlib").Gzip}
     */
    const buildGzipStream = (encoding) => {
      /** @type {import("zlib").Gzip} */
      let gzipStream;
      switch (encoding) {
        case 'deflate':
          gzipStream = createDeflate({ chunkSize: this.chunkSize });
          break;
        case 'gzip':
          gzipStream = createGzip({ chunkSize: this.chunkSize });
          break;
        case 'br':
          gzipStream = createBrotliCompress({ chunkSize: this.chunkSize });
          break;
        default:
          throw new Error('UNKNOWN_ENCODING');
      }

      /** @type {Buffer[]} */
      const pendingChunks = [];

      gzipStream.on('data', (chunk) => {
        if (finalCalled) {
          pendingChunks.push(chunk);
        } else {
          let previousChunk;
          // eslint-disable-next-line no-cond-assign
          while (previousChunk = pendingChunks.shift()) {
            destination.write(previousChunk);
          }
          destination.write(chunk);
        }
      });
      gzipStream.on('end', () => {
        let chunk;
        // eslint-disable-next-line no-cond-assign
        while (chunk = pendingChunks.shift()) {
          destination.write(chunk);
        }
        destination.end();
      });

      return gzipStream;
    };

    // Don't do any work until first chunk is received (if at all).
    // This allows middleware to set `Content-Encoding` manually,
    // prevents allocation memory for a gzip stream unnecessarily, and
    // prevents polluting 204 responses.

    const onEnd = () => destination.end();
    newStream.once('data', (chunk) => {
    // Will be handled by .pipe() or .end() call
      newStream.off('end', onEnd);

      /** @type {string} */
      let encoding = (res.headers['content-encoding']);
      if (encoding == null) {
      // Only continue if unset. Blank is still considered set.
      // This allows forced encoding (eg: use gzip regardless of size; always identity)
        if (inputLength > (this.minimumSize ?? DEFAULT_MINIMUM_SIZE) || transformCount > 1) {
        // If we're getting data in chunks, assume larger than minimum
          encoding = getContentEncoding().toLowerCase?.();
        } else {
          encoding = 'identity';
        }
      }

      let next;
      switch (encoding) {
        case 'br':
        case 'gzip':
        case 'deflate':
          next = buildGzipStream(encoding);
          break;
        default:
          next = destination;
      }
      next.write(chunk);
      newStream.pipe(next);
    });

    // In case no data is passed
    newStream.on('end', onEnd);

    return 'continue';
  }
}

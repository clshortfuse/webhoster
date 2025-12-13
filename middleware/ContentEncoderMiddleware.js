import { promisify } from 'node:util';
import {
  // @ts-expect-error Bad types
  BrotliCompress, Deflate, Gzip,
  constants as ZlibContants,
  brotliCompress, brotliCompressSync,
  deflate, deflateSync,
  gzip, gzipSync,
} from 'node:zlib';

import { parseQualityValues } from '../utils/qualityValues.js';

const { BROTLI_OPERATION_FLUSH, Z_SYNC_FLUSH } = ZlibContants;

/** @typedef {import('http').IncomingHttpHeaders} IncomingHttpHeaders */
/** @typedef {import('../lib/HttpRequest.js').default} HttpRequest */
/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */
/** @typedef {import('../data/custom-types.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../data/custom-types.js').ResponseFinalizer} ResponseFinalizer */

/** @typedef {'br'|'gzip'|'deflate'|'identity'|'*'} COMPATIBLE_ENCODING */

const DEFAULT_MINIMUM_SIZE = 256;

const DEFAULT_ASYNC_THRESHOLD = 64 * 1024;

/**
 * @typedef ContentEncoderMiddlewareOptions
 * @prop {number} [chunkSize]
 * @prop {boolean} [respondNotAcceptable=false]
 * @prop {'br'|'gzip'|'deflate'|'identity'} [preferredEncoding='identity']
 * Minimum content size before using any compression
 * @prop {number} [minimumSize=DEFAULT_MINIMUM_SIZE]
 * Minimum content size before using async compression
 * @prop {number} [asyncThreshold=DEFAULT_ASYNC_THRESHOLD]
 */

/** @type {COMPATIBLE_ENCODING[]} */
const COMPATIBLE_ENCODINGS = ['br', 'gzip', 'deflate', 'identity', '*'];

export default class ContentEncoderMiddleware {
  static BrotliCompressAsync = promisify(brotliCompress);

  static GzipAsync = promisify(gzip);

  static DeflateAsync = promisify(deflate);

  /**
   * @param {IncomingHttpHeaders} headers
   * @throws {NotAcceptableException} Error with `NOT_ACCEPTIBLE` message
   * @return {COMPATIBLE_ENCODING}
   */
  static chooseEncoding(headers) {
  /**
   * A request without an Accept-Encoding header field implies that the
   * user agent has no preferences regarding content-codings.  Although
   * this allows the server to use any content-coding in a response, it
   * does not imply that the user agent will be able to correctly process
   * all encodings.
   */
    if ('accept-encoding' in headers === false) {
      return '*';
    }

    const acceptString = /** @type {string} */ (headers['accept-encoding']);
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
    encoding = /** @type {COMPATIBLE_ENCODING} */ (encodingEntries
      .find(([value, spec]) => spec.q !== 0
        && COMPATIBLE_ENCODINGS.includes(/** @type {COMPATIBLE_ENCODING} */ (value)))?.[0]);
    if (allowWildcards && (encoding === '*' || !encoding)) {
      // Server preference
      // Get first compatible encoding not specified
      encoding = COMPATIBLE_ENCODINGS.find((value) => !encodings.has(value));
    }
    if (allowWildcards && !encoding) {
      // Get highest q'd compatible encoding not q=0 or '*'
      // @ts-expect-error Cannot cast to COMPATIBLE_ENCODINGS
      encoding = /** @type {COMPATIBLE_ENCODINGS} */ encodingEntries
      // @ts-expect-error Cannot cast to COMPATIBLE_ENCODINGS
        .find(([value, spec]) => spec.q !== 0 && value !== '*' && COMPATIBLE_ENCODINGS.includes(value))?.[0];
    }
    if (!encoding) {
      throw new Error('NOT_ACCEPTABLE');
    }
    return encoding;
  }

  /** @param {ContentEncoderMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.chunkSize = options.chunkSize;
    this.respondNotAcceptable = options.respondNotAcceptable === true;
    this.preferredEncoding = options.preferredEncoding ?? 'identity';
    this.minimumSize = options.minimumSize ?? DEFAULT_MINIMUM_SIZE;
    this.asyncThreshold = options.asyncThreshold ?? DEFAULT_ASYNC_THRESHOLD;
    this.finalizeResponse = this.finalizeResponse.bind(this);
  }

  /**
   * @param {HttpResponse} response
   * @return {void}
   */
  addTransformStream(response) {
    /** @type {COMPATIBLE_ENCODING} */
    let parsedEncoding;
    if (this.respondNotAcceptable) {
      // Parse now to catch the error;
      try {
        parsedEncoding = ContentEncoderMiddleware.chooseEncoding(response.request.headers);
      } catch (error) {
        if (error?.message === 'NOT_ACCEPTABLE') {
          response.status = 406;
          response.end();
          throw new Error('NOT_ACCEPTABLE');
        }
        // Unknown error
        throw error;
      }
    }

    /** @return {string} */
    const getContentEncoding = () => {
      if (!parsedEncoding) {
        try {
          parsedEncoding = ContentEncoderMiddleware.chooseEncoding(response.request.headers);
        } catch (error) {
          if (error?.message !== 'NOT_ACCEPTABLE') {
            throw error;
          }
        }
      }
      if (!parsedEncoding || parsedEncoding === '*') {
        parsedEncoding = this.preferredEncoding || 'identity';
      }
      response.headers['content-encoding'] = parsedEncoding;
      return parsedEncoding;
    };

    let encoding = response.request.headers['content-encoding'];
    // Only continue if unset (missing header). Blank is still considered set.
    // This allows forced encoding (eg: use gzip regardless of size; always identity)

    // Unset means server preference
    if (encoding == null) {
      encoding = getContentEncoding().toLowerCase?.();
    }

    const isEventStream = /** @type {string|null} */ (response.headers['content-type'])?.includes('text/event-stream');

    let newStream;
    switch (encoding) {
      case 'br':
        // @ts-expect-error Bad types
        newStream = new BrotliCompress({
          chunkSize: this.chunkSize,
          flush: isEventStream ? BROTLI_OPERATION_FLUSH : undefined,
        });
        break;
      case 'gzip':
        // @ts-expect-error Bad types
        newStream = new Gzip({
          chunkSize: this.chunkSize,
          flush: isEventStream ? Z_SYNC_FLUSH : undefined,
        });
        break;
      case 'deflate':
        // @ts-expect-error Bad types
        newStream = new Deflate({
          chunkSize: this.chunkSize,
          flush: isEventStream ? Z_SYNC_FLUSH : undefined,
        });
        break;
      default:
        return;
    }
    response.pipes.push(newStream);
  }

  /** @type {ResponseFinalizer} */
  finalizeResponse(response) {
    if (response.isStreaming) {
      this.addTransformStream(response);
      return true;
    }

    if (response.body == null) return true;

    /** @type {COMPATIBLE_ENCODING} */
    let parsedEncoding;
    if (this.respondNotAcceptable) {
      // Parse now to catch the error;
      try {
        parsedEncoding = ContentEncoderMiddleware.chooseEncoding(response.request.headers);
      } catch (error) {
        if (error?.message === 'NOT_ACCEPTABLE') {
          // Strip content
          response.body = null;
          response.status = 206;
          return false;
        }
        // Unknown error
        throw error;
      }
    }

    if (!Buffer.isBuffer(response.body)) return true;

    /** @return {string} */
    const getContentEncoding = () => {
      if (!parsedEncoding) {
        try {
          parsedEncoding = ContentEncoderMiddleware.chooseEncoding(response.request.headers);
        } catch (error) {
          if (error?.message !== 'NOT_ACCEPTABLE') {
            throw error;
          }
        }
      }
      if (!parsedEncoding || parsedEncoding === '*') {
        parsedEncoding = this.preferredEncoding || 'identity';
      }
      response.headers['content-encoding'] = parsedEncoding;
      return parsedEncoding;
    };

    let encoding = /** @type {string} */ (response.headers['content-encoding']);
    // Only continue if unset (missing header). Blank is still considered set.
    // This allows forced encoding (eg: use gzip regardless of size; always identity)

    // Unset means server preference
    if (encoding == null) {
      encoding = (response.body.length < this.minimumSize) ? 'identity' : getContentEncoding().toLowerCase?.();
    }

    const options = { chunkSize: this.chunkSize };

    if (response.body.length < this.asyncThreshold) {
      switch (encoding) {
        case 'br':
          response.body = brotliCompressSync(response.body, options);
          break;
        case 'gzip':
          response.body = gzipSync(response.body, options);
          break;
        case 'deflate':
          response.body = deflateSync(response.body, options);
          break;
        default:
      }
      return true;
    }

    let promise;
    switch (encoding) {
      case 'br':
        promise = ContentEncoderMiddleware.BrotliCompressAsync(response.body, options);
        break;
      case 'gzip':
        promise = ContentEncoderMiddleware.GzipAsync(response.body, options);
        break;
      case 'deflate':
        promise = ContentEncoderMiddleware.DeflateAsync(response.body, options);
        break;
      default:
        return true;
    }
    return promise.then((result) => {
      response.body = result;
      return true;
    });
  }

  /**
   * Implements `Accept-Encoding`
   * https://tools.ietf.org/html/rfc7231#section-5.3.4
   * @type {MiddlewareFunction}
   */
  execute({ response }) {
    response.finalizers.push(this.finalizeResponse);
  }
}

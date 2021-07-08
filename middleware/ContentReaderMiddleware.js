import { PassThrough, Transform } from 'stream';

/** @typedef {import('stream').Readable} Readable */
/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} ContentReaderMiddlewareOptions
 * @prop {string} [defaultMediaType]
 * Assumed mediatype if not specified
 * @prop {boolean} [parseJSON=false]
 * Automatically parses JSON if `application/json` mediatype
 * @prop {'entries'|'object'|'string'|'none'} [formURLEncodedFormat='none']
 * Automatically converts to object if `application/x-www-form-urlencoded` mediatype
 * @prop {boolean} [buildString=false]
 * Automatically builds string into one `read()` response
 * @prop {boolean|string} [cache=false]
 * Caches content in req.local.content or req.local[cacheName]
 */

/** @implements {IMiddleware} */
export default class ContentReaderMiddleware {
  /** @param {ContentReaderMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.defaultMediaType = options.defaultMediaType;
    this.parseJSON = options.parseJSON === true;
    this.formURLEncodedFormat = options.formURLEncodedFormat || 'none';
    this.buildString = options.buildString === true;
    this.cache = options.cache;
  }

  /**
   * @param {string} charset
   * @return {BufferEncoding}
   */
  static charsetAsBufferEncoding(charset) {
    switch (charset) {
      case 'iso-8859-1':
      case 'ascii':
      case 'binary':
      case 'latin1':
        return 'latin1';
      case 'utf-16le':
      case 'ucs-2':
      case 'ucs2':
      case 'utf16le':
        return 'utf16le';
      default:
      case 'utf-8':
      case 'utf8':
        return 'utf-8';
      case 'base64':
      case 'hex':
        return /** @type {BufferEncoding} */ (charset);
    }
  }

  /**
   * The application/x-www-form-urlencoded format is in many ways an aberrant monstrosity,
   * the result of many years of implementation accidents and compromises leading to a set of
   * requirements necessary for interoperability, but in no way representing good design practices.
   * In particular, readers are cautioned to pay close attention to the twisted details
   * involving repeated (and in some cases nested) conversions between character encodings and byte sequences.
   * Unfortunately the format is in widespread use due to the prevalence of HTML forms. [HTML]
   * @param {Buffer} buffer
   * @param {string} charset
   * @return {[string, string][]} Tuple
   */
  static readUrlEncoded(buffer, charset) {
  // https://url.spec.whatwg.org/#urlencoded-parsing
    const bufferEncoding = ContentReaderMiddleware.charsetAsBufferEncoding(charset);

    const sequences = [];
    let startIndex = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      if (buffer[i] === 0x26) {
        sequences.push(buffer.subarray(startIndex, i));
        startIndex = i + 1;
      }
      if (i === buffer.length - 1) {
        sequences.push(buffer.subarray(startIndex, i + 1));
        break;
      }
    }
    /** @type {[string, string][]} */
    const output = [];
    sequences.forEach((bytes) => {
      if (!bytes.length) return;

      // Find 0x3D and replace 0x2B in one loop for better performance
      let indexOf0x3D = -1;
      for (let i = 0; i < bytes.length; i += 1) {
        switch (bytes[i]) {
          case 0x3D:
            if (indexOf0x3D === -1) {
              indexOf0x3D = i;
            }
            break;
          case 0x2B:
          // Replace bytes on original stream for memory conservation
          // eslint-disable-next-line no-param-reassign
            bytes[i] = 0x20;
            break;
          default:
        }
      }
      let name;
      let value;
      if (indexOf0x3D === -1) {
        name = bytes;
        value = bytes.subarray(bytes.length, 0);
      } else {
        name = bytes.subarray(0, indexOf0x3D);
        value = bytes.subarray(indexOf0x3D + 1);
      }
      const nameString = decodeURIComponent(name.toString(bufferEncoding));
      const valueString = decodeURIComponent(value.toString(bufferEncoding));
      output.push([nameString, valueString]);
    });
    return output;
  }

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req }) {
    switch (req.method) {
      case 'HEAD':
      case 'GET':
        return 'continue';
      default:
    }

    const contentType = (req.headers['content-type']);
    /** @type {string} */
    let mediaType;
    /** @type {string} */
    let charset;
    if (contentType) {
      contentType.split(';').forEach((directive) => {
        const parameters = directive.split('=');
        if (parameters.length === 1) {
          mediaType = directive.trim().toLowerCase();
          return;
        }
        if (parameters[0].trim().toLowerCase() !== 'charset') {
          return;
        }
        charset = parameters[1]?.trim().toLowerCase();
        const firstQuote = charset.indexOf('"');
        const lastQuote = charset.lastIndexOf('"');
        if (firstQuote !== -1 && lastQuote !== -1) {
          charset = charset.substring(firstQuote + 1, lastQuote);
        }
      });
    }

    if (!mediaType) {
      mediaType = this.defaultMediaType;
    }
    const isFormUrlEncoded = mediaType === 'application/x-www-form-urlencoded';
    const isJSON = /application\/(.+\+)?json/i.test(mediaType);
    if (!charset) {
      if (!mediaType) {
        return 'continue';
      }
      if (isFormUrlEncoded && (this.formURLEncodedFormat || 'none') === 'none') {
        return 'continue';
      }
      if (!isFormUrlEncoded && !isJSON && !mediaType.startsWith('text/')) {
        return 'continue';
      }
    }

    const readAll = isJSON || isFormUrlEncoded;

    let fullString = '';
    /** @type {Buffer[]} */
    const pendingChunks = [];
    const source = req.stream;
    const {
      buildString, formURLEncodedFormat, cache, parseJSON,
    } = this;
    const newReadable = new Transform({
      objectMode: true,
      read(...args) {
        if (source.isPaused()) source.resume();
        // eslint-disable-next-line no-underscore-dangle
        Transform.prototype._read.call(this, ...args);
      },
      transform(chunk, encoding, callback) {
        if (typeof chunk === 'string') {
          if (readAll || buildString) {
            fullString += chunk;
          } else {
            this.push(chunk);
          }
        } else if (isFormUrlEncoded) {
          pendingChunks.push(chunk);
        } else {
          this.push(chunk);
        }
        callback();
      },
      flush(callback) {
        let result = null;
        if (isFormUrlEncoded) {
          const combinedBuffer = Buffer.concat(pendingChunks);
          if (formURLEncodedFormat === 'object') {
            result = Object.fromEntries(ContentReaderMiddleware.readUrlEncoded(combinedBuffer, charset));
          } else if (formURLEncodedFormat === 'string') {
            result = combinedBuffer.toString(ContentReaderMiddleware.charsetAsBufferEncoding(charset));
          } else {
            result = ContentReaderMiddleware.readUrlEncoded(combinedBuffer, charset);
          }
        } else if (isJSON && parseJSON) {
          try {
            result = JSON.parse(fullString);
          } catch {
            result = fullString;
          }
        } else if (fullString) {
          result = fullString;
        }
        if (cache && result) {
          const cacheName = cache === true ? 'content' : cache;
          req.locals[cacheName] = result;
        }
        callback(null, result);
      },
    });
    req.replaceStream(newReadable);
    if (!isFormUrlEncoded) {
    // Data read from source will be decoded as a string
      const encoding = ContentReaderMiddleware.charsetAsBufferEncoding(charset);
      const stringDecoder = new PassThrough({ encoding });
      newReadable.setDefaultEncoding(encoding);
      source.pipe(stringDecoder).pipe(newReadable);
    } else {
      source.pipe(newReadable);
    }
    source.pause();

    return 'continue';
  }
}

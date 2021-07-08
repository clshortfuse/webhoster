import { PassThrough, Transform } from 'stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'zlib';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef ContentDecoderMiddlewareOptions
 * @prop {number} [chunkSize]
 * @prop {boolean} [respondNotAcceptable=false]
 */

/**
 * Implements `Accept-Encoding`
 * https://tools.ietf.org/html/rfc7231#section-5.3.4
 * @implements {IMiddleware}
 */
export default class ContentDecoderMiddleware {
  /** @param {ContentDecoderMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.chunkSize = options.chunkSize;
    this.respondNotAcceptable = options.respondNotAcceptable === true;
  }

  /**
   * @param {!MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req, res }) {
    switch (req.method) {
      case 'HEAD':
      case 'GET':
        return 'continue';
      default:
    }

    res.headers['accept-encoding'] = 'gzip, deflate, br';
    const contentEncoding = (req.headers['content-encoding'] ?? '').trim().toLowerCase();

    switch (contentEncoding) {
      case '':
      case 'identity':
        return 'continue';
      case 'gzip':
      case 'br':
      case 'deflate':
        break;
      default:
        if (this.respondNotAcceptable) {
          res.status = 406;
          return 'end';
        }
        return 'continue';
    }

    const source = req.stream;
    let initialized = false;
    const { chunkSize } = this;
    const newReadable = new PassThrough({
      read(...args) {
        if (!initialized) {
        /** @type {import("zlib").Gzip} */
          let gzipStream;
          switch (contentEncoding) {
            case 'deflate':
              gzipStream = createInflate({ chunkSize });
              break;
            case 'gzip':
              gzipStream = createGunzip({ chunkSize });
              break;
            case 'br':
              gzipStream = createBrotliDecompress({ chunkSize });
              break;
            default:
              throw new Error('UNKNOWN_ENCODING');
          }
          source.pipe(gzipStream).pipe(this);
          initialized = true;
        }
        if (source.isPaused()) source.resume();
        // eslint-disable-next-line no-underscore-dangle
        Transform.prototype._read.call(this, ...args);
      },
    });
    source.pause();
    req.replaceStream(newReadable);
    return 'continue';
  }
}

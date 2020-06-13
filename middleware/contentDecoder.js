import { Transform, PassThrough } from 'stream';
import { createInflate, createGunzip, createBrotliDecompress } from 'zlib';

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
 * @param {MiddlewareFunctionParams} params
 * @param {ContentDecoderMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeContentDecoderMiddleware({ req, res }, options = {}) {
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
      if (options.respondNotAcceptable) {
        res.status = 406;
        return 'end';
      }
      return 'continue';
  }

  const source = req.stream;
  let initialized = false;
  const newReadable = new PassThrough({
    read(...args) {
      if (!initialized) {
        /** @type {import("zlib").Gzip} */
        let gzipStream;
        switch (contentEncoding) {
          case 'deflate':
            gzipStream = createInflate({
              chunkSize: options.chunkSize,
            });
            break;
          case 'gzip':
            gzipStream = createGunzip({
              chunkSize: options.chunkSize,
            });
            break;
          case 'br':
            gzipStream = createBrotliDecompress({
              chunkSize: options.chunkSize,
            });
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

/**
 * @param {ContentDecoderMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createContentDecoderMiddleware(options = {}) {
  return function contentDecoderMiddleware(params) {
    return executeContentDecoderMiddleware(params, options);
  };
}

/** @type {MiddlewareFunction} */
export function defaultContentDecoderMiddleware(params) {
  return executeContentDecoderMiddleware(params);
}

import { Transform } from 'node:stream';
import {
  // @ts-expect-error Bad typings
  BrotliDecompress, Gunzip, Inflate,
} from 'node:zlib';

/** @typedef {import('../data/custom-types.js').MiddlewareFunction} MiddlewareFunction */

/**
 * @typedef ContentDecoderMiddlewareOptions
 * @prop {number} [chunkSize]
 * @prop {boolean} [respondNotAcceptable=false]
 */

const CONTINUE = true;

/**
 * Implements `Accept-Encoding`
 * https://tools.ietf.org/html/rfc7231#section-5.3.4
 */
export default class ContentDecoderMiddleware {
  /** @param {ContentDecoderMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.chunkSize = options.chunkSize;
    this.respondNotAcceptable = options.respondNotAcceptable === true;
  }

  /** @type {MiddlewareFunction} */
  execute({ request, response }) {
    switch (request.method) {
      case 'HEAD':
      case 'GET':
        return CONTINUE;
      default:
    }

    // TODO: Use transforms

    response.headers['accept-encoding'] = 'gzip, deflate, br';
    const contentEncoding = request.headers['content-encoding'];
    if (!contentEncoding) return CONTINUE;

    switch (contentEncoding.trim().toLowerCase()) {
      case '':
      case 'identity':
        return CONTINUE;
      case 'gzip':
      case 'br':
      case 'deflate':
        break;
      default:
        if (this.respondNotAcceptable) {
          return 406;
        }
        return CONTINUE;
    }

    /** @type {import('stream').Readable} */
    let inputStream;

    // Don't built gZipStream until a read request is made
    // By default, newDownstream <= inputStream
    // On first read, newDownstream <= gZipStream <= inputStream
    // Read request is intercepted by newDownstream

    /** @type {import("zlib").Gunzip} */
    let gzipStream;
    let initialized = false;

    const gzipOptions = { chunkSize: this.chunkSize };
    const newDownstream = new Transform({

      read: (...arguments_) => {
        if (!initialized) {
          /** @type {import("zlib").Gzip} */
          switch (contentEncoding) {
            case 'deflate':
              // @ts-expect-error Bad typings
              gzipStream = new Inflate(gzipOptions);
              break;
            case 'gzip':
              // @ts-expect-error Bad typings
              gzipStream = new Gunzip(gzipOptions);
              break;
            case 'br':
              // @ts-expect-error Bad typings
              gzipStream = new BrotliDecompress(gzipOptions);
              break;
            default:
              throw new Error('UNKNOWN_ENCODING');
          }
          // From newDownstream <= inputStream
          // To newDownstream <= gzipStream < =inputStream

          // Forward errors
          gzipStream.on('error', (error) => inputStream.emit('error', error));
          gzipStream.on('data', (chunk) => newDownstream.push(chunk));

          inputStream.on('end', () => gzipStream.end());
          gzipStream.on('end', () => {
            newDownstream.push(null);
            if (newDownstream.readable) {
              newDownstream.end();
            }
          });

          if (inputStream.pause()) inputStream.resume();
          initialized = true;
        }

        // eslint-disable-next-line no-underscore-dangle
        Transform.prototype._read.call(this, ...arguments_);
      },
      transform: (chunk, chunkEncoding, callback) => {
        gzipStream.write(chunk, (error) => {
          if (error) console.error(error);
          callback(error);
        });
      },
      flush: (callback) => {
        if (gzipStream) {
          gzipStream.flush(() => {
            callback();
          });
        }
      },
      final: (callback) => {
        if (gzipStream) {
          gzipStream.end();
          gzipStream.flush(() => {
            callback();
          });
        }
      },
    });

    inputStream = request.addDownstream(newDownstream, { autoPause: true });

    return CONTINUE;
  }
}

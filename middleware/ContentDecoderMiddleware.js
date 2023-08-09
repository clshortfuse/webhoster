import { Transform } from 'node:stream';
import {
  // @ts-expect-error Bad types
  BrotliDecompress, Gunzip, Inflate,
} from 'node:zlib';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */

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

      read: (...args) => {
        if (!initialized) {
          /** @type {import("zlib").Gzip} */
          switch (contentEncoding) {
            case 'deflate':
              // @ts-expect-error Bad types
              gzipStream = new Inflate(gzipOptions);
              break;
            case 'gzip':
              // @ts-expect-error Bad types
              gzipStream = new Gunzip(gzipOptions);
              break;
            case 'br':
              // @ts-expect-error Bad types
              gzipStream = new BrotliDecompress(gzipOptions);
              break;
            default:
              throw new Error('UNKNOWN_ENCODING');
          }
          // From newDownstream <= inputStream
          // To newDownstream <= gzipStream < =inputStream

          // Forward errors
          gzipStream.on('error', (err) => inputStream.emit('error', err));
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

        Transform.prototype._read.call(this, ...args);
      },
      transform: (chunk, chunkEncoding, callback) => {
        gzipStream.write(chunk, (err) => {
          if (err) console.error(err);
          callback(err);
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

    newDownstream.tag = 'ContentDecoder';
    inputStream = request.addDownstream(newDownstream, { autoPause: true });

    return CONTINUE;
  }
}

import crypto from 'crypto';
import { Transform } from 'stream';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

const DEFAULT_ALGORITHM = 'sha1';
/** @type {crypto.HexBase64Latin1Encoding} */
const DEFAULT_DIGEST = 'base64';

/**
 * @typedef {Object} HashMiddlewareOptions
 * @prop {'md5'|'sha1'|'sha256'|'sha512'} [algorithm=DEFAULT_ALGORITHM]
 * @prop {crypto.HexBase64Latin1Encoding} [digest=DEFAULT_DIGEST]
 */

/** @implements {IMiddleware} */
export default class HashMiddleware {
  /** @param {HashMiddlewareOptions} options */
  constructor(options = {}) {
    this.algorithm = options.algorithm || DEFAULT_ALGORITHM;
    this.digest = options.digest || DEFAULT_DIGEST;
  }

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ res }) {
    const { algorithm, digest } = this;
    let hasData = false;
    let length = 0;
    let abort = false;
    const hashStream = crypto.createHash(algorithm);
    const newWritable = new Transform({
      transform(chunk, encoding, callback) {
        length += chunk.length;
        hasData = true;
        if (!abort && res.headersSent) {
          abort = true;
          hashStream.destroy();
        }
        if (abort) {
          callback(null, chunk);
          return;
        }
        // Manually pipe
        const needsDrain = !hashStream.write(chunk);
        if (needsDrain) {
          hashStream.once('drain', () => {
            callback(null, chunk);
          });
        } else {
          callback(null, chunk);
        }
      },
      flush(callback) {
        if (!abort && hasData && res.status !== 206 && !res.headersSent) {
          const hash = hashStream.digest(digest);
          // https://tools.ietf.org/html/rfc7232#section-2.3
          if (res.headers.etag == null) {
            res.headers.etag = `${algorithm === 'md5' ? 'W/' : ''}"${length.toString(16)}-${hash}"`;
          }
          if (digest === 'base64') {
            res.headers.digest = `${algorithm}=${hash}`;
            if ((algorithm === 'md5')) {
              res.headers['content-md5'] = hash;
            }
          }
        }
        callback();
      },
    });

    const destination = res.replaceStream(newWritable);
    newWritable.pipe(destination);
    return 'continue';
  }
}

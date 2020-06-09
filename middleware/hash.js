import { Transform } from 'stream';
import crypto from 'crypto';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

const DEFAULT_ALGORITHM = 'sha1';
const DEFAULT_DIGEST = 'base64';

/**
 * @typedef {Object} HashMiddlewareOptions
 * @prop {'md5'|'sha1'|'sha256'|'sha512'} [algorithm=DEFAULT_ALGORITHM]
 * @prop {crypto.HexBase64Latin1Encoding} [digest=DEFAULT_DIGEST]
 */

/**
 * @param {MiddlewareFunctionParams} params
 * @param {HashMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeHashMiddleware({ res }, options = {}) {
  const algorithm = options.algorithm || DEFAULT_ALGORITHM;
  const digest = options.digest || DEFAULT_DIGEST;


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
        this.once('drain', () => {
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

/**
 * @param {HashMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createHashMiddleware(options = {}) {
  return function hashMiddleware(params) {
    return executeHashMiddleware(params, options);
  };
}

/** @type {MiddlewareFunction} */
export function defaultHashMiddleware(params) {
  return executeHashMiddleware(params);
}

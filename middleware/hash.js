import { PassThrough } from 'stream';
import crypto from 'crypto';
import { addEndObserver, hasEndCalled } from '../utils/writableObserver.js';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

const DEFAULT_ALGORITHM = 'md5';
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


  const hashStream = crypto.createHash(algorithm);
  const newStream = new PassThrough();
  const destination = res.replaceStream(newStream);
  addEndObserver(newStream);
  newStream.pipe(hashStream);
  /** @type {Buffer[]} */
  const pendingChunks = [];
  let hasData = false;

  newStream.on('data', (chunk) => {
    hasData = true;
    if (hasEndCalled(newStream)) {
      pendingChunks.push(chunk);
    } else {
      destination.write(chunk);
    }
  });
  newStream.on('end', () => {
    if (hasData) {
      if (res.status !== 206 && !res.headersSent) {
        const hash = hashStream.digest(digest);

        // https://tools.ietf.org/html/rfc7232#section-2.3
        if (res.headers.etag == null) {
          res.headers.ETag = `${algorithm === 'md5' ? 'W/' : ''}"${hash}"`;
        }

        if (digest === 'base64') {
          res.headers.digest = `${algorithm}=${hash}`;
          if ((algorithm === 'md5')) {
            res.headers['content-md5'] = hash;
          }
        }
      }
      let chunk;
      // eslint-disable-next-line no-cond-assign
      while (chunk = pendingChunks.shift()) {
        destination.write(chunk);
      }
    }
    destination.end();
  });
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

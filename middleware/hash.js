import { PassThrough } from 'stream';
import crypto from 'crypto';
import { addEndObserver, hasEndCalled } from '../utils/writableObserver.js';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} HashMiddlewareOptions
 * @prop {'md5'|'sha1'|'sha256'|'sha512'} [algorithm='md5']
 * @prop {crypto.HexBase64Latin1Encoding} [digest='base64']
 */

/**
 * @param {MiddlewareFunctionParams} params
 * @param {HashMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeHashMiddleware({ req, res }, options = {}) {
  const algorithm = options.algorithm || 'md5';
  const digest = options.digest || 'base64';


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
        res.headers.ETag = hash;
        if (digest === 'base64') {
          res.headers.digest = `${algorithm}=${hash}`;
          if ((algorithm === 'md5')) {
            res.headers['content-md5'] = hash;
          }
        }
      }
      let chunk;
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

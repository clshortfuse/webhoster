import { PassThrough } from 'stream';
import { addEndObserver, hasEndCalled } from '../utils/writableObserver.js';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} ContentLengthMiddlewareOptions
 * @prop {boolean} [delayCycle=true]
 * Delaying a cycle will delay writes by one event loop.
 * If `.end()` is called on the same event loop as write, then the
 * content length can be still calculated despite receiving data in chunks.
 * Compared to no delay, chunks are held in memory for two event loops instead
 * of just one.
 * @prop {boolean} [overrideHeader=false]
 * Always replace `Content-Length` header
 * @prop {boolean} [forceZero=false]
 * Include `Content-Length=0` on empty responses
 * @prop {boolean} [set204=false]
 * Change status code to 204 if empty and set to 200
 */

/**
 * @param {MiddlewareFunctionParams} params
 * @param {ContentLengthMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeContentLengthMiddleware({ res }, options = {}) {
  let written = false;
  const newWritable = new PassThrough();
  addEndObserver(newWritable);
  const destination = res.replaceStream(newWritable);
  /** @type {Buffer[]} */
  const pendingChunks = [];

  /**
   * @param {Buffer} chunk
   * @return {void}
   */
  function writeChunk(chunk) {
    if (!chunk) return;
    destination.write(chunk);
  }

  newWritable.on('data', (chunk) => {
    written = true;
    if (hasEndCalled(newWritable)) {
      pendingChunks.push(chunk);
    } else if (options.delayCycle !== false) {
      pendingChunks.push(chunk);
      setImmediate(() => {
        writeChunk(pendingChunks.shift());
      });
    } else {
      writeChunk(chunk);
    }
  });

  newWritable.on('end', () => {
    if (!written && res.status === 200 && options.set204) {
      if (!res.headersSent) {
        res.status = 204;
      } else {
        console.warn('Status of 200 sent insead of 204!');
      }
    }
    if (written || options.forceZero) {
      if (!res.headersSent) {
        if (options.overrideHeader === true || res.headers['Content-Length'] == null) {
          res.headers['Content-Length'] = pendingChunks.reduce((prev, curr) => prev + curr.length, 0);
        } else {
          console.warn('Content-Length already set!');
        }
      } else if (res.headers['Content-Length'] != null) {
        console.warn('Content-Length already sent!');
      }
    }
    let chunk;
    // eslint-disable-next-line no-cond-assign
    while (chunk = pendingChunks.shift()) {
      destination.write(chunk);
    }
    destination.end();
  });

  return 'continue';
}

/**
 * @param {ContentLengthMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createContentLengthMiddleware(options = {}) {
  return function contentLengthMiddleware(params) {
    return executeContentLengthMiddleware(params, options);
  };
}

/** @type {MiddlewareFunction} */
export function defaultContentLengthMiddleware(params) {
  return executeContentLengthMiddleware(params);
}

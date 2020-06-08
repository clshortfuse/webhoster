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
 */

/**
 * @param {MiddlewareFunctionParams} params
 * @param {ContentLengthMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeContentLengthMiddleware({ req, res }, options = {}) {
  if (req.method === 'HEAD') {
    return 'continue';
  }

  const newWritable = new PassThrough();
  addEndObserver(newWritable);
  const destination = res.replaceStream(newWritable);
  /** @type {Buffer[]} */
  const pendingChunks = [];
  let length = 0;

  /**
   * @param {Buffer} chunk
   * @return {void}
   */
  function writeChunk(chunk) {
    if (!chunk) return;
    destination.write(chunk);
  }

  newWritable.on('data', (chunk) => {
    length += chunk.length;
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
    if (!res.headersSent) {
      /**
       * Any response message which "MUST NOT" include a message-body
       * (such as the 1xx, 204, and 304 responses and any response to a HEAD request)
       * is always terminated by the first empty line after the header fields,
       * regardless of the entity-header fields present in the message.
       * https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.4
       */
      if ((res.status >= 100 && res.status < 200) || res.status === 204 || res.status === 304) {
        if (options.overrideHeader) {
          delete res.headers['content-length'];
        }
      } else if (options.overrideHeader === true || res.headers['content-length'] == null) {
        res.headers['content-length'] = length;
      }
    }

    let chunk;
    // eslint-disable-next-line no-cond-assign
    while (chunk = pendingChunks.shift()) {
      // TODO: Implement backpressure.
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

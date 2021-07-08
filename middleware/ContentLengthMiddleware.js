import { Transform } from 'stream';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} ContentLengthMiddlewareOptions
 * @prop {boolean} [delayCycle=true]
 * Delays writing to stream by one I/O cycle.
 * If `.end()` is called on the same event loop as write, then the
 * content length can be still calculated despite receiving data in chunks.
 * Compared to no delay, chunks are held in memory for two event loops instead
 * of just one.
 * @prop {boolean} [overrideHeader=false]
 * Always replace `Content-Length` header
 */

/** @implements {IMiddleware} */
export default class ContentLengthMiddleware {
  /** @param {ContentLengthMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.delayCycle = options.delayCycle !== false;
    this.overrideHeader = options.overrideHeader !== true;
  }

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req, res }) {
    if (req.method === 'HEAD') {
      return 'continue';
    }

    let length = 0;
    /** @type {Buffer[]} */
    const pendingChunks = [];
    let delayPending = false;
    const { delayCycle, overrideHeader } = this;
    const newWritable = new Transform({
      transform(chunk, encoding, callback) {
        length += chunk.length;
        if (delayCycle === false) {
          callback(null, chunk);
          return;
        }

        pendingChunks.push(chunk);
        if (!delayPending) {
          delayPending = true;
          process.nextTick(() => setImmediate(() => {
            delayPending = false;
            pendingChunks.splice(0, pendingChunks.length)
              .forEach((buffer) => this.push(buffer));
          }));
        }
        callback();
      },
      flush(callback) {
        if (!res.headersSent) {
        /**
         * Any response message which "MUST NOT" include a message-body
         * (such as the 1xx, 204, and 304 responses and any response to a HEAD request)
         * is always terminated by the first empty line after the header fields,
         * regardless of the entity-header fields present in the message.
         * https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.4
         */
          if ((res.status >= 100 && res.status < 200) || res.status === 204 || res.status === 304) {
            if (overrideHeader) {
              delete res.headers['content-length'];
            }
          } else if (overrideHeader === true || res.headers['content-length'] == null) {
            res.headers['content-length'] = length;
          }
        }
        pendingChunks.splice(0, pendingChunks.length)
          .forEach((buffer) => this.push(buffer));
        callback();
      },
    });

    const destination = res.replaceStream(newWritable);
    newWritable.pipe(destination);

    return 'continue';
  }
}

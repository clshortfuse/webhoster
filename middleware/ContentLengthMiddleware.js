/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').ResponseFinalizer} ResponseFinalizer */

import { Transform } from 'node:stream';

/**
 * @typedef {Object} ContentLengthMiddlewareOptions
 * @prop {number} [delayCycles=2]
 * Delays writing to stream by setTimeout cycles when piping.
 * If `.end()` is called on the same event loop as write, then the
 * content length can be still calculated despite receiving data in chunks.
 * @prop {boolean} [overrideHeader=false]
 * Always replace `Content-Length` header
 */

export default class ContentLengthMiddleware {
  /** @param {ContentLengthMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.delayCycles = options.delayCycles ?? 2;
    this.overrideHeader = options.overrideHeader !== true;
    this.finalizeResponse = this.finalizeResponse.bind(this);
  }

  /**
   * @param {HttpResponse} response
   * @return {void}
   */
  addTransformStream(response) {
    if (response.headersSent) return;
    let { delayCycles } = this;
    const { overrideHeader } = this;
    if (response.headers['content-length'] && !overrideHeader) return;
    let length = 0;
    /** @type {Buffer[]} */
    const pendingChunks = [];
    response.pipes.push(new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        length += chunk.length;
        if (!delayCycles) {
          callback(null, chunk);
          return;
        }

        pendingChunks.push(chunk);
        // eslint-disable-next-line no-underscore-dangle, unicorn/consistent-function-scoping
        let fn = () => this._flush(() => { /** noop */ });
        for (let i = 0; i < delayCycles; i++) {
          const prev = fn;
          fn = () => setTimeout(prev);
        }
        fn();
        callback();
      },
      flush(callback) {
        for (const buffer of pendingChunks.splice(0, pendingChunks.length)) {
          this.push(buffer);
        }
        delayCycles = 0;
        callback?.();
      },
      final(callback) {
        if (!response.headersSent) {
        /**
         * Any response message which "MUST NOT" include a message-body
         * (such as the 1xx, 204, and 304 responses and any response to a HEAD request)
         * is always terminated by the first empty line after the header fields,
         * regardless of the entity-header fields present in the message.
         * https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.4
         */
          if ((response.status >= 100 && response.status < 200) || response.status === 204 || response.status === 304) {
            if (overrideHeader) {
              delete response.headers['content-length'];
            }
          } else if (overrideHeader === true || response.headers['content-length'] == null) {
            response.headers['content-length'] = length;
          }
        }
        callback?.();
      },
    }));
  }

  /** @type {ResponseFinalizer} */
  finalizeResponse(response) {
    if (response.headersSent) return;
    if (response.isStreaming) {
      this.addTransformStream(response);
      return;
    }
    if (!Buffer.isBuffer(response.body)) return;
    if (!response.body.byteLength) return;
    /**
     * Any response message which "MUST NOT" include a message-body
     * (such as the 1xx, 204, and 304 responses and any response to a HEAD request)
     * is always terminated by the first empty line after the header fields,
     * regardless of the entity-header fields present in the message.
     * https://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.4
     */
    if (response.status === 204 || response.status === 304 || (response.status >= 100 && response.status < 200)) {
      if (this.overrideHeader) {
        delete response.headers['content-length'];
      }
    } else if (this.overrideHeader === true || response.headers['content-length'] == null) {
      response.headers['content-length'] = response.body.byteLength;
    }
  }

  /** @type {MiddlewareFunction} */
  execute({ response }) {
    response.finalizers.push(this.finalizeResponse);
  }
}

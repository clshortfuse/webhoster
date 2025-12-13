/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */
/** @typedef {import('../data/custom-types.js').ResponseFinalizer} ResponseFinalizer */
/** @typedef {import('../data/custom-types.js').MiddlewareFunction} MiddlewareFunction */

import { Transform } from 'node:stream';

/**
 * @typedef {Object} AutoHeadersMiddlewareOptions
 * @prop {boolean} [setStatus=true]
 * Automatically set `200` or `204` status if not set
 */

export default class AutoHeadersMiddleware {
  /** @param {AutoHeadersMiddlewareOptions} options */
  constructor(options = {}) {
    this.setStatus = options.setStatus !== false;
    this.finalizeResponse = this.finalizeResponse.bind(this);
  }

  /**
   * @param {HttpResponse} response
   * @return {void}
   */
  addTransformStream(response) {
    let firstChunk = false;
    response.pipes.push(new Transform({
      transform: (chunk, encoding, callback) => {
        if (!firstChunk) {
          firstChunk = true;
          if (!response.headersSent) {
            if (response.statusCode == null) {
              if (!this.setStatus) {
                callback(new Error('NO_STATUS'));
                return;
              }
              response.status = 200;
            }
            response.sendHeaders(false);
          }
        }
        callback(null, chunk);
      },
      final: (callback) => {
        if (!response.headersSent) {
          if (this.setStatus && response.statusCode == null) {
            response.status = 204;
          }
          response.sendHeaders(false);
        }
        callback();
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

    if (response.status == null && this.setStatus && Buffer.isBuffer(response.body)) {
      response.status = response.body.byteLength ? 200 : 204;
    }
    response.sendHeaders();
  }

  /** @type {MiddlewareFunction} */
  execute({ response }) {
    response.finalizers.push(this.finalizeResponse);
  }
}

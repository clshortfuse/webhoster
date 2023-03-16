import CaseInsensitiveObject from '../utils/CaseInsensitiveObject.js';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */

/**
 * @typedef {Object} CaseInsensitiveHeadersMiddlewareOptions
 * @prop {boolean} [request=false] Mutate request headers to be case-insensitive
 * @prop {boolean} [response=false] Mutate response headers to be case-insensistive
 */

export default class CaseInsensitiveHeadersMiddleware {
  /** @param {CaseInsensitiveHeadersMiddlewareOptions} options */
  constructor(options) {
    this.request = options.request === true;
    this.response = options.response === true;
  }

  /** @type {MiddlewareFunction} */
  execute({ request, response }) {
    if (this.request) {
    // @ts-ignore Coerce
      request.headers = new CaseInsensitiveObject(request.headers || {});
    }
    if (this.response) {
    // @ts-ignore Coerce
      response.headers = new CaseInsensitiveObject(response.headers || {});
    }
  }
}

import CaseInsensitiveObject from '../utils/CaseInsensitiveObject.js';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} CaseInsensitiveHeadersMiddlewareOptions
 * @prop {boolean} [request=false] Mutate request headers to be case-insensitive
 * @prop {boolean} [response=false] Mutate response headers to be case-insensistive
 */

/** @implements {IMiddleware} */
export default class CaseInsensitiveHeadersMiddleware {
  /** @param {CaseInsensitiveHeadersMiddlewareOptions} options */
  constructor(options) {
    this.request = options.request === true;
    this.response = options.response === true;
  }

  /**
   * @param {!MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req, res }) {
    if (this.request) {
    // @ts-ignore Coerce
      req.headers = new CaseInsensitiveObject(req.headers || {});
    }
    if (this.response) {
    // @ts-ignore Coerce
      res.headers = new CaseInsensitiveObject(res.headers || {});
    }
    return 'continue';
  }
}

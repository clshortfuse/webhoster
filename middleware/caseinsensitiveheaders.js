import CaseInsensitiveObject from '../utils/CaseInsensitiveObject.js';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} CaseInsensitiveHeadersMiddlewareOptions
 * @prop {boolean} [request=true]
 * Mutate request headers to be case-insensitive
 * @prop {boolean} [response=false]
 * Mutate response headers to be case-insensistive
 */

/**
 * @param {MiddlewareFunctionParams} params
 * @param {CaseInsensitiveHeadersMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeCaseInsensitiveHeadersMiddleware({ req, res }, options = {}) {
  if (options.request !== false) {
    // @ts-ignore
    req.headers = new CaseInsensitiveObject(req.headers || {});
  }
  if (options.response !== false) {
    // @ts-ignore
    res.headers = new CaseInsensitiveObject(res.headers || {});
  }
  return 'continue';
}

/**
 * @param {CaseInsensitiveHeadersMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createCaseInsensitiveHeadersMiddleware(options = {}) {
  return function caseInsensitiveHeadersMiddleware(params) {
    return executeCaseInsensitiveHeadersMiddleware(params, options);
  };
}

/** @type {MiddlewareFunction} */
export function defaultCaseInsensitiveHeadersMiddleware(params) {
  return executeCaseInsensitiveHeadersMiddleware(params);
}

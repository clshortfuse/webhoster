export { default as HttpRequest } from './lib/HttpRequest.js';

export { default as HttpResponse } from './lib/HttpResponse.js';

export * as RequestHandler from './lib/RequestHandler.js';


/** @typedef {'GET'|'HEAD'|'POST'|'PUT'|'DELETE'|'CONNECT'|'OPTIONS'|'TRACE'|'PATCH'} RequestMethod */

/** @typedef {boolean} MiddlewareFilterResultType */
/** @typedef {Promise<MiddlewareFilterResultType>|MiddlewareFilterResultType} MiddlewareFilterResult */


/** @typedef {'end'|'break'|'continue'|null|undefined|void} MiddlewareFunctionResultType */
/** @typedef {Promise<MiddlewareFunctionResultType>|MiddlewareFunctionResultType} MiddlewareFunctionResult */

/** @typedef {import('./types/index').Middleware} Middleware */

/**
 * @typedef {Object} MiddlewareFunctionParams
 * @prop {import('./lib/HttpRequest').default} req
 * @prop {import('./lib/HttpResponse').default} res
 */

/**
 * @typedef {Object} MiddlewareErrorHandlerParams
 * @prop {import('./lib/HttpRequest').default} req
 * @prop {import('./lib/HttpResponse').default} res
 * @prop {any} err
 */

/**
 * @callback MiddlewareFunction
 * @param {MiddlewareFunctionParams} params
 * @return {MiddlewareFunctionResult}
 */

/**
 * @callback MiddlewareErrorHandlerFunction
 * @param {MiddlewareErrorHandlerParams} params
 * @return {MiddlewareFunctionResult}
 */

/**
 * @typedef {Object} MiddlewareErrorHandler
 * @prop {MiddlewareErrorHandlerFunction} onError
 */

/**
 * Breaks middleware chain returns `false`.
 *
 * **Note**: Must return a boolean
 * @callback MiddlewareFilter
 * @param {MiddlewareFunctionParams} params
 * @return {MiddlewareFilterResult} continue?
 */

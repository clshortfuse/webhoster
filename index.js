/** @typedef {'GET'|'HEAD'|'POST'|'PUT'|'DELETE'|'CONNECT'|'OPTIONS'|'TRACE'|'PATCH'} RequestMethod */

/** @typedef {boolean} MiddlewareFilterResultType */
/** @typedef {Promise<MiddlewareFilterResultType>|MiddlewareFilterResultType} MiddlewareFilterResult */


/** @typedef {'end'|'break'|'continue'|null|undefined|void} MiddlewareFunctionResultType */
/** @typedef {Promise<MiddlewareFunctionResultType>|MiddlewareFunctionResultType} MiddlewareFunctionResult */

/** @typedef {import('./lib/HttpRequest').default} HttpRequest */
/** @typedef {import('./lib/HttpResponse').default} HttpResponse */

/**
 * @typedef {Object} MiddlewareFunctionParams
 * @prop {HttpRequest} req
 * @prop {HttpResponse} res
 */

/**
 * @typedef {Object} MiddlewareErrorHandlerParams
 * @prop {HttpRequest} req
 * @prop {HttpResponse} res
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

/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../lib/HttpRequest.js').RequestMethod} RequestMethod */

/**
 * @param {RequestMethod[]} methods
 * @return {MiddlewareFunction}
 */
export function createMethodMiddleware(...methods) {
  return function methodMiddleware(req) {
    return { break: methods.every((method) => method.toUpperCase() !== req.method) };
  };
}

/**
 * @param {RequestMethod|RegExp} method
 * @return {MiddlewareFunction}
 */
export function createMethodRegexMiddleware(method) {
  const pathRegex = (typeof method === 'string') ? RegExp(method, 'i') : method;
  return function methodMiddleware(req) {
    return { break: !pathRegex?.test(req.method) };
  };
}

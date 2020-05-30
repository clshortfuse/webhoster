/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../lib/HttpRequest.js').RequestMethod} RequestMethod */

/**
 * @param {RequestMethod[]} methods
 * @return {MiddlewareFunction}
 */
export function createMethodMiddleware(...methods) {
  return function methodMiddleware(req) {
    return methods.every((method) => method.toUpperCase() !== req.method) ? 'break' : 'continue';
  };
}

/**
 * @param {RequestMethod|RegExp} method
 * @return {MiddlewareFunction}
 */
export function createMethodRegexMiddleware(method) {
  const pathRegex = (typeof method === 'string') ? RegExp(method, 'i') : method;
  return function methodMiddleware(req) {
    return !pathRegex?.test(req.method) ? 'break' : 'continue';
  };
}

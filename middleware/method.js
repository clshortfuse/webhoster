/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../lib/HttpRequest.js').RequestMethod} RequestMethod */

/**
 * @param {RequestMethod} method
 * @return {MiddlewareFunction}
 */
export function createMethodMiddleware(method) {
  return (req) => ({
    break: method?.toUpperCase() !== req.method,
  });
}

/**
 * @param {RequestMethod|RegExp} method
 * @return {MiddlewareFunction}
 */
export function createMethodRegexMiddleware(method) {
  const pathRegex = (typeof method === 'string') ? RegExp(method, 'i') : method;
  return (req) => ({ break: !pathRegex?.test(req.method) });
}

/**
 * @param {RequestMethod[]} methods
 * @return {MiddlewareFunction}
 */
export function createMethodListMiddleware(methods) {
  return (req) => ({ break: !methods.some((method) => method.toUpperCase() === req.method) });
}

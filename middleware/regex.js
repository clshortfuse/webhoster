/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */

/**
 * @param {MiddlewareFunction} fn
 * @param {string|RegExp} path
 * @param {string|RegExp} method
 * @return {MiddlewareFunction}
 */
export function createRegexMiddleware(fn, path, method) {
  const pathRegex = (typeof path === 'string') ? RegExp(path, 'i') : path;
  const methodRegex = (typeof method === 'string') ? RegExp(method, 'i') : method;
  /** @type {MiddlewareFunction} */
  const newFn = (req, res) => {
    if (pathRegex?.test(req.url.pathname) === false) return Promise.resolve(false);
    if (methodRegex?.test(req.method) === false) return Promise.resolve(false);

    return fn(req, res);
  };
  return newFn;
}

export function noop() { }

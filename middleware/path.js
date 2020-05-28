import { relative } from 'path';

/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */

/**
 * @param {string} path
 * @return {MiddlewareFunction}
 */
export function createPathMiddleware(path) {
  return (req) => ({
    break: path !== req.url.pathname,
  });
}

/**
 * @param {string|RegExp} path
 * @return {MiddlewareFunction}
 */
export function createPathRegexMiddleware(path) {
  const pathRegex = (typeof path === 'string') ? RegExp(path, 'i') : path;
  return (req) => ({
    break: pathRegex?.test(req.url.pathname) === false,
  });
}

/**
 * @param {string} path
 * @return {MiddlewareFunction}
 */
export function createPathRelativeMiddleware(path) {
  return (req) => ({
    break: relative(path, req.url.pathname).startsWith('..'),
  });
}

import { relative } from 'path';

/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */

/**
 * @param {string[]} paths
 * @return {MiddlewareFunction}
 */
export function createPathMiddleware(...paths) {
  return function pathMiddleware(req) {
    return paths.every((path) => path !== req.url.pathname) ? 'break' : 'continue';
  };
}

/**
 * @param {string|RegExp} path
 * @return {MiddlewareFunction}
 */
export function createPathRegexMiddleware(path) {
  const pathRegex = (typeof path === 'string') ? RegExp(path, 'i') : path;
  return function pathMiddleware(req) {
    return pathRegex?.test(req.url.pathname) === false ? 'break' : 'continue';
  };
}

/**
 * @param {string[]} paths
 * @return {MiddlewareFunction}
 */
export function createPathRelativeMiddleware(...paths) {
  return function pathMiddleware(req) {
    return paths.every((path) => relative(path, req.url.pathname).startsWith('..')) ? 'break' : 'continue';
  };
}

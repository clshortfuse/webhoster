import { relative } from 'path';

/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */

/**
 * @param {string[]} paths
 * @return {MiddlewareFunction}
 */
export function createPathMiddleware(...paths) {
  return function pathMiddleware(req) {
    return { break: paths.every((path) => path !== req.url.pathname) };
  };
}

/**
 * @param {string|RegExp} path
 * @return {MiddlewareFunction}
 */
export function createPathRegexMiddleware(path) {
  const pathRegex = (typeof path === 'string') ? RegExp(path, 'i') : path;
  return function pathMiddleware(req) {
    return { break: pathRegex?.test(req.url.pathname) === false };
  };
}

/**
 * @param {string[]} paths
 * @return {MiddlewareFunction}
 */
export function createPathRelativeMiddleware(...paths) {
  return function pathMiddleware(req) {
    return { break: paths.every((path) => relative(path, req.url.pathname).startsWith('..')) };
  };
}

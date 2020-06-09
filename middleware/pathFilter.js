import { relative } from 'path';

/** @typedef {import('../types').MiddlewareFilter} MiddlewareFilter */

/**
 * @param {string[]} paths
 * @return {MiddlewareFilter}
 */
export function createPathFilter(...paths) {
  return function pathMiddleware({ req }) {
    return paths.some((path) => path === req.url.pathname);
  };
}

/**
 * @param {string|RegExp} path
 * @return {MiddlewareFilter}
 */
export function createPathRegexFilter(path) {
  const pathRegex = (typeof path === 'string') ? RegExp(path, 'i') : path;
  return function pathMiddleware({ req }) {
    return pathRegex?.test(req.url.pathname) === true;
  };
}

/**
 * @param {string[]} paths
 * @return {MiddlewareFilter}
 */
export function createPathRelativeFilter(...paths) {
  return function pathMiddleware({ req }) {
    return paths.some((path) => !relative(path, req.url.pathname).startsWith('..'));
  };
}

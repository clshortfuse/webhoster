import { join as joinPath, relative as relativePath } from 'path';

/** @typedef {import('../types').HttpRequest} HttpRequest */
/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */
/** @typedef {import('../types').RequestMethod} RequestMethod */

/** @typedef {RegExp|string} PathEntry */

/**
 * @typedef {Object} PathHistoryEntry hello?
 * @prop {string} base
 * @prop {number[]} treeIndex
 */

/**
 * @typedef {Object} PathState
 * @prop {PathHistoryEntry[]} history
 * @prop {string} currentPath
 */

/**
 * @typedef {Object} PathMiddlewareOptions
 * @prop {PathEntry|PathEntry[]} [path]
 * @prop {string} [key='path']
 * @prop {boolean} [absolute=false]
 * Path is not relative to previous PathMiddleware. Defaults to `false`.
 * @prop {boolean} [subPath=false]
 * Path values are subpaths. Default to `false`;
 */

/** @implements {IMiddleware} */
export default class PathMiddleware {
  /** @param {PathMiddlewareOptions|PathEntry|PathEntry[]} options */
  constructor(options) {
    if (Array.isArray(options)) {
      this.path = options;
      this.key = 'path';
      this.absolute = false;
      this.subPath = false;
    } else if (typeof options === 'string' || options instanceof RegExp) {
      this.path = [options];
      this.key = 'path';
      this.absolute = false;
      this.subPath = false;
    } else {
      this.path = Array.isArray(options.path) ? options.path : [options.path];
      this.key = options.key || 'path';
      this.absolute = options.absolute === true;
      this.subPath = options.subPath === true;
    }
  }

  /**
   * @param {PathEntry|PathEntry[]} entry
   */
  static SUBPATH(entry) {
    const path = Array.isArray(entry) ? entry : [entry];
    return new PathMiddleware({
      path: path.map((p) => (typeof p === 'string' ? RegExp(`^(${p})/*.*$`) : p)),
      subPath: true,
    });
  }

  /**
   * @param {string} path
   * @param {RegExp | string} input
   * @return {?string}
   */
  static test(path, input) {
    if (typeof input === 'string') {
      return (path === input ? input : null);
    }
    const result = input.exec(path);
    if (!result) return null;
    if (result.length === 1) {
      return result[0];
    }
    return result[1] ?? result[0];
  }

  /**
   * @param {HttpRequest} req
   * @param {string} base new base subpath
   * @param {number[]} treeIndex this node's treeIndex
   * @param {string} currentPath
   * @return {void}
   */
  writePathState(req, base, treeIndex, currentPath) {
    /** @type {PathState} */
    let state = req.locals[this.key];
    if (!state) {
      state = { history: [], currentPath };
      req.locals[this.key] = state;
    } else if (!state.history) {
      state.history = [];
    }
    state.history.push({ base, treeIndex: [...treeIndex] });
    state.currentPath = currentPath;
  }

  /**
   * @param {HttpRequest} req
   * @param {number[]} treeIndex this node's treeIndex
   * @return {string} joined base path
   */
  readPathState(req, treeIndex) {
    /** @type {PathState} */
    const state = req.locals[this.key];
    if (!state || !state.history || !state.history.length) {
      return '/';
    }
    const paths = [];
    let newLength = 0;
    /* eslint-disable no-labels, no-restricted-syntax */
    historyLoop: {
      for (let i = 0; i < state.history.length; i++) {
        const item = state.history[i];
        if (item.treeIndex.length >= treeIndex.length) break;
        for (let j = 0; j < item.treeIndex.length - 1; j++) {
          if (item.treeIndex[j] !== treeIndex[j]) break historyLoop;
        }
        paths.push(item.base);
        newLength++;
      }
    }
    if (state.history.length !== newLength) {
      state.history.length = newLength;
    }
    if (!paths.length) {
      return '/';
    }
    return joinPath(...paths);
  }

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req, state }) {
    const currentPath = this.absolute ? '' : this.readPathState(req, state.treeIndex);
    const comparison = this.absolute ? req.url.pathname : `/${relativePath(currentPath, req.url.pathname)}`;

    for (let i = 0; i < this.path.length; i++) {
      const path = this.path[i];
      const result = PathMiddleware.test(comparison, path);
      if (result) {
        if (this.subPath) {
          this.writePathState(req, result, state.treeIndex, joinPath(currentPath, result));
        }
        return 'continue';
      }
    }

    return 'break';
  }
}

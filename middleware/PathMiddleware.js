import { posix } from 'node:path';

/** @typedef {import('../data/custom-types.js').HttpTransaction} HttpTransaction */
/** @typedef {import('../data/custom-types.js').IMiddleware} IMiddleware */
/** @typedef {import('../data/custom-types.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../data/custom-types.js').RequestMethod} RequestMethod */

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
 * @prop {boolean} [absolute=false]
 * Path is not relative to previous PathMiddleware. Defaults to `false`.
 * @prop {boolean} [subPath=false]
 * Path values are subpaths. Default to `false`;
 */

export default class PathMiddleware {
  /**
   * @param {PathEntry|PathEntry[]} entry
   */
  static SUBPATH(entry) {
    const path = Array.isArray(entry) ? entry : [entry];
    return new PathMiddleware({
      path: path.map((p) => (typeof p === 'string' ? new RegExp(`^(${p})($|(/.*$))`) : p)),
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
   * @param {HttpTransaction} transaction
   * @param {string} base new base subpath
   * @param {string} currentPath
   * @return {void}
   */
  static WritePathState(transaction, base, currentPath) {
    const { state } = transaction;
    if (!state.path) {
      state.path = { history: [], currentPath };
    } else if (!state.path.history) {
      state.path.history = [];
    }
    state.path.history.push({ base, treeIndex: [...state.treeIndex] });
    state.path.currentPath = currentPath;
  }

  /**
   * @param {HttpTransaction} transaction
   * @return {string} joined base path
   */
  static ReadPathState(transaction) {
    const { path, treeIndex } = transaction.state;
    if (!path || !path.history || !path.history.length) {
      return '/';
    }
    const paths = [];
    let newLength = 0;
    /* eslint-disable no-labels */
    historyLoop: {
      for (const item of path.history) {
        if (item.treeIndex.length >= treeIndex.length) break;
        // TODO: Confirm length-1
        for (let index = 0; index < item.treeIndex.length - 1; index++) {
          if (item.treeIndex[index] !== treeIndex[index]) break historyLoop;
        }
        paths.push(item.base);
        newLength++;
      }
    }
    if (path.history.length !== newLength) {
      path.history.length = newLength;
    }
    if (!paths.length) {
      return '/';
    }
    return posix.join(...paths);
  }

  /** @param {PathMiddlewareOptions|PathEntry|PathEntry[]} options */
  constructor(options) {
    if (Array.isArray(options)) {
      this.path = options;
      this.absolute = false;
      this.subPath = false;
    } else if (typeof options === 'string' || options instanceof RegExp) {
      this.path = [options];
      this.absolute = false;
      this.subPath = false;
    } else {
      this.path = Array.isArray(options.path) ? options.path : [options.path];
      this.absolute = options.absolute === true;
      this.subPath = options.subPath === true;
    }
  }

  /** @type {MiddlewareFunction} */
  execute(transaction) {
    const currentPath = this.absolute ? '' : PathMiddleware.ReadPathState(transaction);
    const comparison = this.absolute ? transaction.request.pathname : `/${posix.relative(currentPath, transaction.request.pathname)}`;

    for (const path of this.path) {
      const result = PathMiddleware.test(comparison, path);
      if (result) {
        if (this.subPath) {
          PathMiddleware.WritePathState(transaction, result, posix.join(currentPath, result));
        }
        return true;
      }
    }
    return false;
  }
}

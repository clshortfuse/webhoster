/** @typedef {import('../data/custom-types.js').HttpTransaction} HttpTransaction */
/** @typedef {import('../data/custom-types.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../data/custom-types.js').RequestMethod} RequestMethod */

/** @typedef {RegExp|RequestMethod} MethodEntry */

/**
 * @typedef {Object} MethodMiddlewareOptions
 * @prop {MethodEntry|MethodEntry[]} method
 */

export default class MethodMiddleware {
  /** @param {MethodMiddlewareOptions|MethodEntry|MethodEntry[]} options */
  constructor(options) {
    if (Array.isArray(options)) {
      this.method = options;
    } else if (typeof options === 'string' || options instanceof RegExp) {
      this.method = [options];
    } else {
      this.method = Array.isArray(options.method) ? options.method : [options.method];
    }
  }

  /** @type {Map<MethodEntry, MethodMiddleware>} */
  static cache = new Map();

  /**
   * @param {RequestMethod} method
   * @param {RegExp | string} input
   * @return {boolean}
   */
  static test(method, input) {
    if (typeof input === 'string') {
      return method === input;
    }
    return input.test(method) === true;
  }

  /** @type {MiddlewareFunction} */
  execute({ request }) {
    for (const method of this.method) {
      if (MethodMiddleware.test(request.method, method)) {
        return true;
      }
    }
    return false;
  }

  /** @type {MiddlewareFunction} */
  static CONNECT({ request }) { return request.method === 'CONNECT'; }

  /** @type {MiddlewareFunction} */
  static DELETE({ request }) { return request.method === 'DELETE'; }

  /** @type {MiddlewareFunction} */
  static HEADORGET({ request }) { return request.method === 'HEAD' || request.method === 'GET'; }

  /** @type {MiddlewareFunction} */
  static GET({ request }) { return request.method === 'GET'; }

  /** @type {MiddlewareFunction} */
  static OPTIONS({ request }) { return request.method === 'OPTIONS'; }

  /** @type {MiddlewareFunction} */
  static HEAD({ request }) { return request.method === 'HEAD'; }

  /** @type {MiddlewareFunction} */
  static PATCH({ request }) { return request.method === 'PATCH'; }

  /** @type {MiddlewareFunction} */
  static POST({ request }) { return request.method === 'POST'; }

  /** @type {MiddlewareFunction} */
  static PUT({ request }) { return request.method === 'PUT'; }

  /** @type {MiddlewareFunction} */
  static TRACE({ request }) { return request.method === 'TRACE'; }
}

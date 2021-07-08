/** @typedef {import('../lib').HttpRequest} HttpRequest */
/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */
/** @typedef {import('../types').RequestMethod} RequestMethod */

/** @typedef {RegExp|RequestMethod} MethodEntry */

/**
 * @typedef {Object} MethodMiddlewareOptions
 * @prop {MethodEntry|MethodEntry[]} method
 */

/** @implements {IMiddleware} */
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

  /** @type {Map<RequestMethod, MethodMiddleware>} */
  static cache = new Map();

  /**
   * @param {RequestMethod} name
   * @return {MethodMiddleware}
   */
  static byMethod(name) {
    let m = MethodMiddleware.cache.get(name);
    if (m) return m;
    m = new MethodMiddleware(name);
    MethodMiddleware.cache.set(name, m);
    return m;
  }

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

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req }) {
    for (let i = 0; i < this.method.length; i++) {
      if (MethodMiddleware.test(req.method, this.method[i])) {
        return 'continue';
      }
    }
    return 'break';
  }

  static get CONNECT() { return MethodMiddleware.byMethod('CONNECT'); }

  static get DELETE() { return MethodMiddleware.byMethod('DELETE'); }

  static get GET() { return MethodMiddleware.byMethod('GET'); }

  static get OPTIONS() { return MethodMiddleware.byMethod('OPTIONS'); }

  static get HEAD() { return MethodMiddleware.byMethod('HEAD'); }

  static get PATCH() { return MethodMiddleware.byMethod('PATCH'); }

  static get POST() { return MethodMiddleware.byMethod('POST'); }

  static get PUT() { return MethodMiddleware.byMethod('PUT'); }

  static get TRACE() { return MethodMiddleware.byMethod('TRACE'); }
}

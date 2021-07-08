/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */
/** @typedef {import('../types').RequestMethod} RequestMethod */

/**
 * @typedef CORSMiddlewareOptions
 * @prop {(string|RegExp)[]} [allowOrigin]
 * Indicates whether the response can be shared, via returning the literal
 * value of the `Origin` request header (which can be `null`) or `*` in a response.
 * @prop {boolean} [allowCredentials]
 * Indicates whether the response can be shared when request’s credentials mode is "include".
 * @prop {RequestMethod[]} [allowMethods]
 * Indicates which methods are supported by the response’s URL for the purposes of the CORS protocol.
 * @prop {string[]} [allowHeaders]
 * Indicates which headers are supported by the response’s URL for the purposes of the CORS protocol.
 * @prop {number} [maxAge]
 * Indicates the number of seconds (5 by default) the information provided by the
 * `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` headers can be cached.
 * @prop {string[]} [exposeHeaders]
 * Indicates which headers can be exposed as part of the response by listing their names.
 */

/** @implements {IMiddleware} */
export default class CORSMiddleware {
  /** @param {CORSMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.allowOrigin = options.allowOrigin;
    this.allowCredentials = options.allowCredentials === true;
    this.allowMethods = options.allowMethods;
    this.allowHeaders = options.allowHeaders;
    this.maxAge = options.maxAge ?? 5;
    this.exposeHeaders = options.exposeHeaders;
  }

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req, res }) {
    if (('origin' in req.headers) === false) {
    // not CORS
      return 'continue';
    }
    if (!this.allowOrigin) {
    // Unspecified default of '*'
      res.headers['access-control-allow-origin'] = '*';
    } else {
      this.allowOrigin.some((origin) => {
        if (origin === '*') {
          res.headers['access-control-allow-origin'] = '*';
          return true;
        }
        if (typeof origin === 'string') {
          if (req.headers.origin?.toLowerCase() === origin.toLowerCase()) {
            res.headers['access-control-allow-origin'] = req.headers.origin;
            return true;
          }
          return false;
        }
        if (origin.test(req.headers.origin)) {
          res.headers['access-control-allow-origin'] = req.headers.origin;
          return true;
        }
        return false;
      });
    }
    if (this.allowCredentials) {
      res.headers['access-control-allow-credentials'] = 'true';
    }
    if (req.method === 'OPTIONS') {
      if (this.allowMethods) {
        res.headers['access-control-allow-methods'] = this.allowMethods.join(',');
      } else {
        res.headers['access-control-allow-methods'] = [
          'GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'TRACE', 'PATCH',
        ].join(',');
      }
      if (this.allowHeaders) {
        res.headers['access-control-allow-headers'] = this.allowHeaders.join(',');
      } else {
        res.headers['access-control-allow-headers'] = req.headers['access-control-request-headers'];
      }
      if (this.maxAge != null) {
        res.headers['access-control-max-age'] = this.maxAge.toString(10);
      }
      // 200 instead of 204 for compatibility
      res.status = 200;
      res.stream.end('OK');
      return 'end';
    }

    if (this.exposeHeaders) {
      res.headers['access-control-expose-headers'] = this.exposeHeaders.join(',');
    }
    return 'continue';
  }
}

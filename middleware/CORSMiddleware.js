/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
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
 * @prop {number} [maxAge=5]
 * Indicates the number of seconds (5 by default) the information provided by the
 * `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` headers can be cached.
 * @prop {string[]} [exposeHeaders]
 * Indicates which headers can be exposed as part of the response by listing their names.
 */

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

  static OK_BUFFER = Buffer.from('OK', 'ascii');

  static ACCESS_CONTROL_ALLOW_HEADERS_ALL = [
    'GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'TRACE', 'PATCH',
  ].join(',');

  /** @type {MiddlewareFunction} */
  execute({ request, response }) {
    if (('origin' in request.headers) === false) {
      // not CORS
      return true; // CONTINUE
    }

    // CORS Request
    if (!this.allowOrigin) {
      // Unspecified default of '*'
      response.headers['access-control-allow-origin'] = '*';
    } else {
      for (const origin of this.allowOrigin) {
        if (origin === '*') {
          response.headers['access-control-allow-origin'] = '*';
          break;
        }
        if (typeof origin === 'string') {
          if (request.headers.origin?.toLowerCase() === origin.toLowerCase()) {
            response.headers['access-control-allow-origin'] = request.headers.origin;
            break;
          }
        } else if (origin.test(request.headers.origin)) {
          response.headers['access-control-allow-origin'] = request.headers.origin;
          break;
        }
      }
    }

    if (this.allowCredentials) {
      response.headers['access-control-allow-credentials'] = 'true';
    }

    if (request.method === 'OPTIONS') {
      response.headers['access-control-allow-methods'] = this.allowMethods
        ? this.allowMethods.join(',')
        : CORSMiddleware.ACCESS_CONTROL_ALLOW_HEADERS_ALL;
      response.headers['access-control-allow-headers'] = this.allowHeaders
        ? this.allowHeaders.join(',')
        : request.headers['access-control-request-headers'];
      if (this.maxAge != null) {
        response.headers['access-control-max-age'] = this.maxAge.toString(10);
      }
      // 200 instead of 204 for compatibility
      // Manual handling for faster response
      response.status = 200;
      response.headers['content-length'] = '0';
      response.sendHeaders(true, true);
      return 0; // END
    }

    // Non-CORS-preflight request
    if (this.exposeHeaders) {
      response.headers['access-control-expose-headers'] = this.exposeHeaders.join(',');
    }
    return true; // CONTINUE
  }
}

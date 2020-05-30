/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../lib/HttpRequest.js').default} HttpRequest */
/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */
/** @typedef {import('../lib/RequestHandler.js').MiddlewareResult} MiddlewareResult

/**
 * @typedef CORSMiddlewareOptions
 * @prop {(string|RegExp)[]} [allowOrigin]
 * Indicates whether the response can be shared, via returning the literal
 * value of the `Origin` request header (which can be `null`) or `*` in a response.
 * @prop {boolean} [allowCredentials]
 * Indicates whether the response can be shared when request’s credentials mode is "include".
 * @prop {string[]} [allowMethods]
 * Indicates which methods are supported by the response’s URL for the purposes of the CORS protocol.
 * @prop {string[]} [allowHeaders]
 * Indicates which headers are supported by the response’s URL for the purposes of the CORS protocol.
 * @prop {number} [maxAge]
 * Indicates the number of seconds (5 by default) the information provided by the
 * `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` headers can be cached.
 * @prop {string[]} [exposeHeaders]
 * Indicates which headers can be exposed as part of the response by listing their names.
 */

/**
 * @param {HttpRequest} req
 * @param {HttpResponse} res
 * @param {CORSMiddlewareOptions} [options]
 * @return {MiddlewareResult}
 */
function executeCORSMiddleware(req, res, options = {}) {
  if (('origin' in req.headers) === false) {
    // not CORS
    return 'continue';
  }
  if (!options.allowOrigin) {
    // Unspecified default of '*'
    res.headers['Access-Control-Allow-Origin'] = '*';
  } else {
    options.allowOrigin.some((origin) => {
      if (origin === '*') {
        res.headers['Access-Control-Allow-Origin'] = '*';
        return true;
      }
      if (typeof origin === 'string') {
        if (req.headers.origin?.toLowerCase() === origin.toLowerCase()) {
          res.headers['Access-Control-Allow-Origin'] = req.headers.origin;
          return true;
        }
        return false;
      }
      if (origin.test(req.headers.origin)) {
        res.headers['Access-Control-Allow-Origin'] = req.headers.origin;
        return true;
      }
      return false;
    });
  }
  if (options.allowCredentials) {
    res.headers['Access-Control-Allow-Credentials'] = 'true';
  }
  if (req.method === 'OPTIONS') {
    if (options.allowMethods) {
      res.headers['Access-Control-Allow-Methods'] = options.allowMethods.join(',');
    }
    if (options.allowHeaders) {
      res.headers['Access-Control-Allow-Methods'] = options.allowMethods.join(',');
    }
    if (options.maxAge) {
      res.headers['Access-Control-Max-Age'] = options.maxAge.toString(10);
    }
    // 200 instead of 204 for compatibility
    res.status = 200;
    res.headers['Content-Length'] = 2;
    res.payload.write('OK', 'ascii');
    return 'end';
  }

  if (options.exposeHeaders) {
    res.headers['Access-Control-Expose-Headers'] = options;
  }
  return 'continue';
}

/**
 * @param {CORSMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createCORSMiddleware(options = {}) {
  return function corsMiddleware(req, res) {
    return executeCORSMiddleware(req, res, options);
  };
}

/** @type {MiddlewareFunction}  */
export function defaultCORSMiddleware(req, res) {
  return executeCORSMiddleware(req, res);
}

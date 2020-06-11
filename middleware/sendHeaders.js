import { PassThrough } from 'stream';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} SendHeadersMiddlewareOptions
 * @prop {boolean} [set200or204=false]
 * Automatically set `200` or `204` status if not set
 */

/**
 * @param {MiddlewareFunctionParams} params
 * @param {SendHeadersMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeSendHeadersMiddleware({ res }, options = {}) {
  const newWritable = new PassThrough();
  const destination = res.replaceStream(newWritable);
  newWritable.once('data', () => {
    if (!res.headersSent) {
      if (options.set200or204 && res.status == null) {
        res.status = 200;
      }
      res.sendHeaders(false);
    }
  });
  newWritable.on('end', () => {
    if (!res.headersSent) {
      if (options.set200or204 && res.status == null) {
        res.status = 204;
      }
      res.sendHeaders(false);
    }
  });
  newWritable.pipe(destination);
  return 'continue';
}

/**
 * @param {SendHeadersMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createSendHeadersMiddleware(options = {}) {
  return function sendHeadersMiddleware(params) {
    return executeSendHeadersMiddleware(params, options);
  };
}

/** @type {MiddlewareFunction} */
export function defaultSendHeadersMiddleware(params) {
  return executeSendHeadersMiddleware(params);
}

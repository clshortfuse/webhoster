import { PassThrough } from 'stream';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} SendHeadersMiddlewareOptions
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
      res.sendHeaders(false);
    }
  });

  newWritable.on('end', () => {
    if (!res.headersSent) {
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

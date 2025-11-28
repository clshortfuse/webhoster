import HttpHandler from '../lib/HttpHandler.js';
import HttpListener from '../helpers/HttpListener.js';
import ContentDecoderMiddleware from '../middleware/ContentDecoderMiddleware.js';
import SendStringMiddleware from '../middleware/SendStringMiddleware.js';
import SendJsonMiddleware from '../middleware/SendJsonMiddleware.js';
import ContentEncoderMiddleware from '../middleware/ContentEncoderMiddleware.js';
import HashMiddleware from '../middleware/HashMiddleware.js';
import ContentLengthMiddleware from '../middleware/ContentLengthMiddleware.js';
import AutoHeadersMiddleware from '../middleware/AutoHeadersMiddleware.js';
import HeadMethodMiddleware from '../middleware/HeadMethodMiddleware.js';

/**
 * @param {Object} options
 * @param {string} [options.host='0.0.0.0']
 * @param {number} [options.port=8080]
 * @param {import('../types').Middleware[]} [options.middleware]
 * @param {import('../types').MiddlewareErrorHandler[]} [options.errorHandlers]
 * @return {Promise<import('../helpers/HttpListener.js').default>}
 */
export async function start(options) {
  HttpHandler.defaultInstance.middleware.push(
    new ContentDecoderMiddleware(),
    new SendStringMiddleware(),
    new SendJsonMiddleware(),
    new ContentEncoderMiddleware(),
    new HashMiddleware(),
    new ContentLengthMiddleware(),
    new AutoHeadersMiddleware(),
    new HeadMethodMiddleware(),
  );
  if (options.middleware) {
    // Push by reference to allow post modification
    HttpHandler.defaultInstance.middleware.push(options.middleware);
  }
  if (!options.errorHandlers) {
    HttpHandler.defaultInstance.errorHandlers.push(
      {
        onError() {
          return 500;
        },
      },
    );
  }

  HttpListener.defaultInstance.configure({
    insecureHost: options.host,
    insecurePort: options.port,
  });

  await HttpListener.defaultInstance.startHttpServer();

  return HttpListener.defaultInstance;
}

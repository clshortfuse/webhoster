import HttpHandler from 'webhoster/lib/HttpHandler.js';
import HttpListener from 'webhoster/helpers/HttpListener.js';
import SendStringMiddleware from 'webhoster/middleware/SendStringMiddleware.js';
import AutoHeadersMiddleware from 'webhoster/middleware/AutoHeadersMiddleware.js';

export async function startServer({ host = '127.0.0.1', port = 0 } = {}) {
  HttpHandler.defaultInstance.middleware.push(
    new SendStringMiddleware(),
    new AutoHeadersMiddleware(),
    ({ response }) => {
      response.headers['content-type'] = 'text/plain; charset=utf-8';
      return 'hello world';
    },
  );

  HttpListener.defaultInstance.configure({
    insecureHost: host,
    insecurePort: port,
  });

  await HttpListener.defaultInstance.startHttpServer();
  return HttpListener.defaultInstance;
}

export async function stopServer() {
  await HttpListener.defaultInstance.stopAll();
}

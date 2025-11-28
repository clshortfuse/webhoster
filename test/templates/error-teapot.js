import test from 'ava';
import http from 'node:http';
import HttpListener from '../../helpers/HttpListener.js';
import HttpHandler from '../../lib/HttpHandler.js';
import * as starter from '../../templates/starter.js';

test.serial('custom error handler returns 418 I\'m a teapot', async (t) => {
  const handler = HttpHandler.defaultInstance;
  const listener = HttpListener.defaultInstance;

  const mwLen = handler.middleware.length;
  const ehLen = handler.errorHandlers.length;

  const throwingMiddleware = [() => { throw new Error('brew failed'); }];
  const teapotHandler = {
    onError(transaction) {
      // set custom status and body
      transaction.response.status = 418;
      return "I'm a teapot";
    },
  };

  await starter.start({ middleware: throwingMiddleware, errorHandlers: [teapotHandler], host: '127.0.0.1', port: 0 });

  t.truthy(listener.httpServer, 'server started');
  const addr = listener.httpServer.address();
  t.truthy(addr && addr.port, 'server bound');

  const result = await new Promise((resolve, reject) => {
    const req = http.get({ port: addr.port, path: '/' }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
  });

  t.is(result.status, 418);
  t.true(result.body.includes("teapot"));

  await listener.stopHttpServer();

  // restore global handler state
  handler.middleware.splice(mwLen);
  handler.errorHandlers.splice(ehLen);
});

import test from 'ava';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import HttpHandler from '../../lib/HttpHandler.js';
import ContentDecoderMiddleware from '../../middleware/ContentDecoderMiddleware.js';
import SendStringMiddleware from '../../middleware/SendStringMiddleware.js';
import SendJsonMiddleware from '../../middleware/SendJsonMiddleware.js';
import ContentEncoderMiddleware from '../../middleware/ContentEncoderMiddleware.js';
import HashMiddleware from '../../middleware/HashMiddleware.js';
import ContentLengthMiddleware from '../../middleware/ContentLengthMiddleware.js';
import AutoHeadersMiddleware from '../../middleware/AutoHeadersMiddleware.js';
import HeadMethodMiddleware from '../../middleware/HeadMethodMiddleware.js';

function request({ port, path: reqPath }) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: reqPath }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
  });
}

const fixturePath = path.join('test', 'fixtures', 'docs-starter-sample.js');

test.serial('docs starter sample: fixture source of truth runs', async (t) => {
  const handler = HttpHandler.defaultInstance;
  const mwLength = handler.middleware.length;
  const ehLength = handler.errorHandlers.length;

  const { startServer, stopServer } = await import(pathToFileURL(path.resolve(fixturePath)).href);
  const listener = await startServer({ port: 0 });
  const server = listener.httpServer;

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  t.truthy(port, 'server bound to a port');

  const added = handler.middleware.slice(mwLength);
  const stack = added.slice(0, 8);
  t.is(stack.length, 8, 'starter middleware stack length');
  t.true(stack[0] instanceof ContentDecoderMiddleware);
  t.true(stack[1] instanceof SendStringMiddleware);
  t.true(stack[2] instanceof SendJsonMiddleware);
  t.true(stack[3] instanceof ContentEncoderMiddleware);
  t.true(stack[4] instanceof HashMiddleware);
  t.true(stack[5] instanceof ContentLengthMiddleware);
  t.true(stack[6] instanceof AutoHeadersMiddleware);
  t.true(stack[7] instanceof HeadMethodMiddleware);

  const result = await request({ port, path: '/' });
  t.is(result.status, 200);
  t.true(result.body.includes('Hello from the starter template'));

  await stopServer();

  handler.middleware.splice(mwLength);
  handler.errorHandlers.splice(ehLength);
});

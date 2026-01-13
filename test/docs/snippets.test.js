import test from 'ava';
import path from 'node:path';
import http from 'node:http';
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

function fixtureUrl(fixturePath) {
  return pathToFileURL(path.resolve(fixturePath)).href;
}

test.serial('docs getting-started (starter): fixture source of truth runs', async (t) => {
  const fixturePath = path.join('test', 'fixtures', 'docs-getting-started-starter.js');

  const handler = HttpHandler.defaultInstance;
  const mwLength = handler.middleware.length;
  const ehLength = handler.errorHandlers.length;

  const { startServer, stopServer } = await import(fixtureUrl(fixturePath));
  const listener = await startServer({ port: 0 });
  const server = listener.httpServer;
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  const result = await request({ port, path: '/' });
  t.is(result.status, 200);
  t.true(result.body.includes('Hello from the starter template'));

  await stopServer();
  handler.middleware.splice(mwLength);
  handler.errorHandlers.splice(ehLength);
});

test.serial('docs getting-started (manual): fixture source of truth runs', async (t) => {
  const fixturePath = path.join('test', 'fixtures', 'docs-getting-started-manual.js');

  const handler = HttpHandler.defaultInstance;
  const mwLength = handler.middleware.length;
  const ehLength = handler.errorHandlers.length;

  const { startServer, stopServer } = await import(fixtureUrl(fixturePath));
  const listener = await startServer({ port: 0 });
  const server = listener.httpServer;
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  const result = await request({ port, path: '/' });
  t.is(result.status, 200);
  t.true(result.body.includes('hello world'));

  await stopServer();
  handler.middleware.splice(mwLength);
  handler.errorHandlers.splice(ehLength);
});

test.serial('docs samples README: fixture source of truth runs', async (t) => {
  const fixturePath = path.join('test', 'fixtures', 'docs-samples-readme.js');

  const handler = HttpHandler.defaultInstance;
  const mwLength = handler.middleware.length;
  const ehLength = handler.errorHandlers.length;

  const { startServer, stopServer } = await import(fixtureUrl(fixturePath));
  const listener = await startServer({ port: 0 });
  const server = listener.httpServer;
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  const result = await request({ port, path: '/' });
  t.is(result.status, 200);
  t.true(result.body.includes('Hello world'));

  await stopServer();
  handler.middleware.splice(mwLength);
  handler.errorHandlers.splice(ehLength);
});

test.serial('docs templates starter: fixture source of truth runs', async (t) => {
  const fixturePath = path.join('test', 'fixtures', 'docs-templates-starter.js');

  const handler = HttpHandler.defaultInstance;
  const mwLength = handler.middleware.length;
  const ehLength = handler.errorHandlers.length;

  const { startServer, stopServer } = await import(fixtureUrl(fixturePath));
  const listener = await startServer({ port: 0 });
  const server = listener.httpServer;
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  const result = await request({ port, path: '/' });
  t.is(result.status, 200);
  t.true(result.body.includes('ok'));

  await stopServer();
  handler.middleware.splice(mwLength);
  handler.errorHandlers.splice(ehLength);
});

test.serial('docs middleware stack: fixture source of truth runs', async (t) => {
  const fixturePath = path.join('test', 'fixtures', 'docs-middleware-stack.js');

  const { middleware } = await import(fixtureUrl(fixturePath));
  t.is(middleware.length, 8);
  t.true(middleware[0] instanceof ContentDecoderMiddleware);
  t.true(middleware[1] instanceof SendStringMiddleware);
  t.true(middleware[2] instanceof SendJsonMiddleware);
  t.true(middleware[3] instanceof ContentEncoderMiddleware);
  t.true(middleware[4] instanceof HashMiddleware);
  t.true(middleware[5] instanceof ContentLengthMiddleware);
  t.true(middleware[6] instanceof AutoHeadersMiddleware);
  t.true(middleware[7] instanceof HeadMethodMiddleware);
});

test.serial('docs middleware branching: fixture source of truth runs', async (t) => {
  const fixturePath = path.join('test', 'fixtures', 'docs-middleware-branching.js');

  const handler = HttpHandler.defaultInstance;
  const mwLength = handler.middleware.length;
  await import(fixtureUrl(fixturePath));
  t.true(handler.middleware.length > mwLength);
  handler.middleware.splice(mwLength);
});

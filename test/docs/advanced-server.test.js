import test from 'ava';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import HttpHandler from '../../lib/HttpHandler.js';

function request({ port, method, path: reqPath, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: reqPath,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const fixturePath = path.join('test', 'fixtures', 'docs-advanced-server.js');

test.serial.before(async (t) => {
  const handler = HttpHandler.defaultInstance;
  t.context.mwLength = handler.middleware.length;
  t.context.ehLength = handler.errorHandlers.length;

  const { startServer, stopServer } = await import(pathToFileURL(path.resolve(fixturePath)).href);
  const listener = await startServer({ port: 0 });
  const server = listener.httpServer;
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  t.context.server = { listener, port, stopServer };
});

test.serial.after.always(async (t) => {
  if (t.context.server) {
    await t.context.server.stopServer();
  }
  const handler = HttpHandler.defaultInstance;
  if (t.context.mwLength != null) handler.middleware.splice(t.context.mwLength);
  if (t.context.ehLength != null) handler.errorHandlers.splice(t.context.ehLength);
});

test.serial('advanced server: echo JSON', async (t) => {
  const { port } = t.context.server;
  const body = JSON.stringify({ message: 'hi' });
  const res = await request({
    port,
    method: 'POST',
    path: '/api/echo',
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    },
    body,
  });

  t.is(res.status, 200);
  const parsed = JSON.parse(res.body.toString());
  t.true(parsed.ok);
  t.is(parsed.received.message, 'hi');
});

test.serial('advanced server: sse stream', async (t) => {
  const { port } = t.context.server;
  const res = await request({
    port,
    method: 'GET',
    path: '/api/stream',
  });

  t.is(res.status, 200);
  const text = res.body.toString();
  t.true(text.includes('data:'));
  t.true(text.includes('event: end'));
});

test.serial('advanced server: binary response', async (t) => {
  const { port } = t.context.server;
  const res = await request({
    port,
    method: 'GET',
    path: '/api/binary',
  });

  t.is(res.status, 200);
  t.is(res.body.toString(), 'hello');
  t.is(res.headers['content-type'], 'application/octet-stream');
});

test.serial('advanced server: chunked upload assembly', async (t) => {
  const { port } = t.context.server;
  const chunk1 = Buffer.from('hello ');
  const chunk2 = Buffer.from('world');
  const sessionId = 'test-session';

  const res1 = await request({
    port,
    method: 'POST',
    path: '/api/upload',
    headers: {
      'x-session': sessionId,
      'x-chunk-index': '0',
      'x-final': 'false',
      'content-length': chunk1.length,
    },
    body: chunk1,
  });
  t.is(res1.status, 200);

  const res2 = await request({
    port,
    method: 'POST',
    path: '/api/upload',
    headers: {
      'x-session': sessionId,
      'x-chunk-index': '1',
      'x-final': 'true',
      'content-length': chunk2.length,
    },
    body: chunk2,
  });
  t.is(res2.status, 200);
  const parsed = JSON.parse(res2.body.toString());
  t.true(parsed.ok);
  t.is(parsed.bytes, chunk1.length + chunk2.length);
});

test.serial('advanced server: static file', async (t) => {
  const { port } = t.context.server;
  const res = await request({
    port,
    method: 'GET',
    path: '/index.html',
  });

  t.is(res.status, 200);
  t.true(res.body.toString().includes('Fixture index'));
  t.is(res.headers['content-type'], 'text/html');
});

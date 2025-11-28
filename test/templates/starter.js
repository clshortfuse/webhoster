import test from 'ava';
import http from 'node:http';
import HttpListener from '../../helpers/HttpListener.js';
import HttpHandler from '../../lib/HttpHandler.js';
import * as starter from '../../templates/starter.js';

test.serial('examples/starter starts singleton listener and responds', async (t) => {
  // Import the example. It applies middleware and starts the singleton listener.
  await import('../../examples/starter.js');

  const listener = HttpListener.defaultInstance;
  const server = listener.httpServer;
  t.truthy(server, 'singleton server started');

  const addr = server.address();
  t.truthy(addr && addr.port, 'server bound to a port');

  const result = await new Promise((resolve, reject) => {
    const request = http.get({ port: addr.port, path: '/' }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    request.on('error', reject);
  });

  t.is(result.status, 200);
  t.true(typeof result.body === 'string');
  t.true(result.body.length > 0, 'response body present');

  await listener.stopHttpServer();
});

test.serial('starter.start applies default error handler and middleware when none provided', async (t) => {
  const handler = HttpHandler.defaultInstance;
  const listener = HttpListener.defaultInstance;

  const mwLength = handler.middleware.length;
  const ehLength = handler.errorHandlers.length;

  // Start with empty options to exercise the default-error-handler branch
  // Use port 0 and loopback host to avoid port collisions in CI.
  await starter.start({ host: '127.0.0.1', port: 0 });

  t.truthy(listener.httpServer, 'httpServer started');

  t.true(handler.middleware.length >= mwLength + 8, 'starter middleware applied');
  t.true(handler.errorHandlers.length > ehLength, 'default error handler added');

  const lastError = handler.errorHandlers.at(-1);
  t.is(typeof lastError.onError, 'function');

  // Invoke the default onError to exercise its code path (logging + 500).
  const result = lastError.onError({ request: { url: '/x' }, error: new Error('boom') });
  t.is(result, 500);

  await listener.stopHttpServer();

  // restore handler arrays to previous lengths
  handler.middleware.splice(mwLength);
  handler.errorHandlers.splice(ehLength);
});

test.serial('starter.start respects provided errorHandlers and pushes middleware by reference', async (t) => {
  const handler = HttpHandler.defaultInstance;
  const listener = HttpListener.defaultInstance;

  const mwLength = handler.middleware.length;
  const ehLength = handler.errorHandlers.length;

  const customHandlers = [{ onError: () => 418 }];
  const customMiddleware = [() => 'custom'];

  await starter.start({
    middleware: customMiddleware, errorHandlers: customHandlers, host: '127.0.0.1', port: 0,
  });

  t.truthy(listener.httpServer, 'httpServer started');

  // The supplied middleware array should be pushed as a single entry (by reference)
  const lastMw = handler.middleware.at(-1);
  t.is(lastMw, customMiddleware);

  // The implementation does not automatically append provided `errorHandlers`;
  // it only avoids adding the default when `options.errorHandlers` is supplied.
  t.is(handler.errorHandlers.length, ehLength);

  await listener.stopHttpServer();

  handler.middleware.splice(mwLength);
  handler.errorHandlers.splice(ehLength);
});

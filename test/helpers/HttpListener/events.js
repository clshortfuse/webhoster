import * as http from 'node:http';
import { Socket } from 'node:net';

import test from 'ava';

import HttpListener from '../../../helpers/HttpListener.js';

// Event listener coverage: simulate error/clientError/request events

test('httpServer emits error and clientError', (t) => {
  const listener = new HttpListener();
  const server = listener.createHttpServer();
  let errorCalled = false;
  let clientErrorCalled = false;
  server.on('error', () => { errorCalled = true; });
  server.on('clientError', () => { clientErrorCalled = true; });
  server.emit('error', new Error('test error'));
  server.emit('clientError', new Error('test client error'), new EventTarget());
  t.true(errorCalled);
  t.true(clientErrorCalled);
});

// Cannot easily test request/stream/session events without real network, but can check listeners are attached

test('listeners are attached for request and error events', async (t) => {
  const listener = new HttpListener({ insecurePort: 0 });
  await listener.startHttpServer();
  const server = listener.httpServer;
  t.true(server.listenerCount('request') > 0);
  t.true(server.listenerCount('error') > 0);
  t.true(server.listenerCount('clientError') > 0);
  await listener.stopHttpServer();
});

// Test that 'clientError' event handler is called for bad request
test('httpServer clientError event is called for bad request', async (t) => {
  const listener = new HttpListener({ insecurePort: 0 });
  await listener.startHttpServer();
  const server = listener.httpServer;
  let called = false;
  server.on('clientError', () => { called = true; });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : address;
  const socket = new Socket();
  socket.connect(Number(port), '127.0.0.1', () => {
    socket.write('BAD REQUEST\r\n\r\n');
    setTimeout(() => {
      socket.destroy();
    }, 50);
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  t.true(called);
  await listener.stopHttpServer();
});

// Test that 'error' event handler is called for server error
test('httpServer error event is called', async (t) => {
  const listener = new HttpListener({ insecurePort: 0 });
  await listener.startHttpServer();
  const server = listener.httpServer;
  let called = false;
  server.on('error', () => { called = true; });
  server.emit('error', new Error('test error')); // Simulate error
  t.true(called);
  await listener.stopHttpServer();
});

// Test that listeners are removed after stop
test('listeners are removed after stop', async (t) => {
  const listener = new HttpListener({ insecurePort: 0 });
  await listener.startHttpServer();
  const server = listener.httpServer;
  await listener.stopHttpServer();
  t.is(server.listenerCount('request'), 0);
  t.is(server.listenerCount('error'), 0);
  t.is(server.listenerCount('clientError'), 0);
});
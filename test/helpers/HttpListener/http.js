import { Socket } from 'node:net';

import test from 'ava';

import HttpListener from '../../../helpers/HttpListener.js';

test('HttpListener.startHttpServer() and stopHttpServer() work', async (t) => {
  const listener = new HttpListener({ insecurePort: 0 }); // Use ephemeral port
  const server = await listener.startHttpServer();
  t.truthy(server);
  await listener.stopHttpServer();
  t.pass();
});

test('HttpListener HTTP server closes idle socket after keepAliveTimeout', async (t) => {
  const listener = new HttpListener({ insecurePort: 0 });
  await listener.startHttpServer();
  const server = listener.httpServer;
  server.setTimeout(1000); // Set keepAliveTimeout to 1 seconds
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : address;
  const socket = new Socket();
  let destroyed = false;
  socket.on('close', () => { destroyed = true; });
  socket.connect(Number(port), '127.0.0.1', () => {
    // Do not send any data, just keep connection open
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  t.true(destroyed, 'Socket should be destroyed after keepAliveTimeout');
  await listener.stopHttpServer();
});

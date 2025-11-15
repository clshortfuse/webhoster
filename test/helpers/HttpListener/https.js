import { connect as tlsConnect } from 'node:tls';

import test from 'ava';

import HttpListener from '../../../helpers/HttpListener.js';

const key = process.env.TEST_SSL_KEY;
const cert = process.env.TEST_SSL_CERT;
const haveCerts = key && cert;

const testFn = haveCerts ? test : test.skip;

testFn('HttpListener.startHttpsServer() and stopHttpsServer() work', async (t) => {
  const tlsOptions = { key, cert };
  const listener = new HttpListener({ securePort: 0, useHttps: true, tlsOptions });
  const server = await listener.startHttpsServer();
  t.truthy(server);
  await listener.stopHttpsServer();
  t.pass();
});

testFn('HttpListener HTTPS server closes idle socket after keepAliveTimeout', async (t) => {
  const tlsOptions = { key, cert };
  const listener = new HttpListener({ securePort: 0, useHttps: true, tlsOptions });
  await listener.startHttpsServer();
  const server = listener.httpsServer;
  server.setTimeout(1000);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : address;
  let destroyed = false;
  const socket = tlsConnect({ port: Number(port), host: '127.0.0.1', rejectUnauthorized: false }, () => {
    // Do not send any data, just keep connection open
  });
  socket.on('close', () => { destroyed = true; });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  t.true(destroyed, 'TLS socket should be destroyed after keepAliveTimeout');
  await listener.stopHttpsServer();
});

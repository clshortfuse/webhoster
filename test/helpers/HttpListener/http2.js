import { connect } from 'node:http2';

import test from 'ava';

import HttpListener from '../../../helpers/HttpListener.js';

const key = process.env.TEST_SSL_KEY;
const cert = process.env.TEST_SSL_CERT;
const haveCerts = key && cert;

const testFn = haveCerts ? test : test.skip;

testFn('HttpListener.startHttp2Server() and stopHttp2Server() work', async (t) => {
  const tlsOptions = { key, cert };
  const listener = new HttpListener({ securePort: 0, useHttp2: true, tlsOptions });
  const server = await listener.startHttp2Server();
  t.truthy(server);
  await listener.stopHttp2Server();
  t.pass();
});

testFn('HttpListener HTTP2 server closes idle socket after setTimeout', async (t) => {
  const tlsOptions = { key, cert };
  const listener = new HttpListener({ securePort: 0, useHttp2: true, tlsOptions });
  await listener.startHttp2Server();
  const server = listener.http2Server;
  server.setTimeout(1000); // Set keepAliveTimeout to 1 seconds
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : address;
  const client = connect(`https://127.0.0.1:${port}`, {
    ca: cert,
    rejectUnauthorized: false,
  });
  let closed = false;
  client.on('close', () => { closed = true; });
  // Do not send any requests, just keep connection open
  await new Promise((resolve) => setTimeout(resolve, 2000));
  t.true(closed, 'HTTP2 client should be closed after setTimeout');
  client.destroy();
  await listener.stopHttp2Server();
});

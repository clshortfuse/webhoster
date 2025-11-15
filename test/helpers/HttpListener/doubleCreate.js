import test from 'ava';

import HttpListener, { SERVER_ALREADY_CREATED } from '../../../helpers/HttpListener.js';

// Test double server creation throws error
test('createHttpServer throws if called twice with custom options', (t) => {
  const listener = new HttpListener();
  listener.createHttpServer();
  t.notThrows(() => listener.createHttpServer());
  t.notThrows(() => listener.createHttpServer({}));
  const err = t.throws(() => listener.createHttpServer({ maxHeaderSize: 8192 }));
  t.truthy(err);
  t.is(err.message, SERVER_ALREADY_CREATED);
});

// Use environment variables for PEM string values
const key = process.env.TEST_SSL_KEY;
const cert = process.env.TEST_SSL_CERT;
const haveCerts = key && cert;
const testFn = (haveCerts ? test : test.skip);

testFn('createHttpsServer throws if called twice with custom options', (t) => {
  const listener = new HttpListener({ useHttps: true, tlsOptions: { key, cert } });
  listener.createHttpsServer();
  t.notThrows(() => listener.createHttpsServer());
  t.notThrows(() => listener.createHttpsServer({}));
  const err = t.throws(() => listener.createHttpsServer({ maxHeaderSize: 8192 }));
  t.truthy(err);
  t.is(err.message, SERVER_ALREADY_CREATED);
});

testFn('createHttp2Server throws if called twice with custom options', (t) => {
  const listener = new HttpListener({ useHttp2: true, tlsOptions: { key, cert } });
  listener.createHttp2Server();
  t.notThrows(() => listener.createHttp2Server());
  t.notThrows(() => listener.createHttp2Server({}));
  const err = t.throws(() => listener.createHttp2Server({ settings: { maxConcurrentStreams: 100 } }));
  t.truthy(err);
  t.is(err.message, SERVER_ALREADY_CREATED);
});

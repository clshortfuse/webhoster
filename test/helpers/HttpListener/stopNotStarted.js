import test from 'ava';
import HttpListener from '../../../helpers/HttpListener.js';

// Test stop methods when servers are not started (should resolve, not throw)
test('stopHttpServer resolves if not started', async t => {
  const listener = new HttpListener();
  await t.notThrowsAsync(() => listener.stopHttpServer());
});

test('stopHttpsServer resolves if not started', async t => {
  const listener = new HttpListener({ useHttps: true });
  await t.notThrowsAsync(() => listener.stopHttpsServer());
});

test('stopHttp2Server resolves if not started', async t => {
  const listener = new HttpListener({ useHttp2: true });
  await t.notThrowsAsync(() => listener.stopHttp2Server());
});

test('stopAll resolves if nothing started', async t => {
  const listener = new HttpListener({ useHttp: false, useHttps: false, useHttp2: false });
  await t.notThrowsAsync(() => listener.stopAll());
});

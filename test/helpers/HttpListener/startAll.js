import test from 'ava';

import HttpListener from '../../../helpers/HttpListener.js';

// Test startAll and stopAll with all modes enabled (HTTP, HTTPS, HTTP/2)

const key = process.env.TEST_SSL_KEY;
const cert = process.env.TEST_SSL_CERT;
const haveCerts = !!key && !!cert;

test('HttpListener.startAll() and stopAll() work (all modes)', async (t) => {
  const listener = new HttpListener({
    insecurePort: 0,
    securePort: 0,
    useHttp: true,
    useHttps: haveCerts,
    useHttp2: haveCerts,
    tlsOptions: haveCerts ? { key, cert } : undefined,
  });
  const [http, https, http2] = await listener.startAll();
  t.truthy(http);
  if (haveCerts) {
    t.truthy(https);
    t.truthy(http2);
  } else {
    t.is(https, null);
    t.is(http2, null);
  }
  await listener.stopAll();
  t.pass();
});

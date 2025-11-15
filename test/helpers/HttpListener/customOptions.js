import test from 'ava';
import HttpListener from '../../../helpers/HttpListener.js';

// Test custom port/host and handler injection

test('custom insecurePort and insecureHost are set', t => {
  const listener = new HttpListener({ insecurePort: 1234, insecureHost: '127.0.0.1' });
  t.is(listener.insecurePort, 1234);
  t.is(listener.insecureHost, '127.0.0.1');
});

test('custom securePort and secureHost are set', t => {
  const listener = new HttpListener({ securePort: 4321, secureHost: 'localhost' });
  t.is(listener.securePort, 4321);
  t.is(listener.secureHost, 'localhost');
});

test('custom httpHandler is set', t => {
  const fakeHandler = { handleHttp1Request() {}, handleHttp2Stream() {} };
  const listener = new HttpListener({ httpHandler: fakeHandler });
  t.is(listener.httpHandler, fakeHandler);
});

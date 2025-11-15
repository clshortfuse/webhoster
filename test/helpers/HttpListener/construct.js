import test from 'ava';

import HttpListener from '../../../helpers/HttpListener.js';

test('HttpListener can be constructed with defaults', (t) => {
  const listener = new HttpListener();
  t.truthy(listener);
  t.is(typeof listener.startHttpServer, 'function');
  t.is(typeof listener.stopHttpServer, 'function');
});

test('HttpListener.defaultInstance returns a singleton', (t) => {
  const inst1 = HttpListener.defaultInstance;
  const inst2 = HttpListener.defaultInstance;
  t.truthy(inst1);
  t.is(inst1, inst2);
  t.true(inst1 instanceof HttpListener);
});

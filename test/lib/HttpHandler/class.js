import test from 'ava';

import HttpHandler from '../../../lib/HttpHandler.js';

test('new HttpHandler()', (t) => {
  const instance = new HttpHandler({});
  t.assert(instance instanceof HttpHandler);
});

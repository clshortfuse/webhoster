import test from 'ava';

import HttpRequest from '../../../lib/HttpRequest.js';

test('new HttpRequest()', (t) => {
  const req = new HttpRequest({});
  t.assert(req instanceof HttpRequest);
});

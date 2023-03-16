import test from 'ava';

import HttpResponse from '../../../lib/HttpResponse.js';

test('new HttpResponse()', (t) => {
  const req = new HttpResponse({});
  t.assert(req instanceof HttpResponse);
});

import test from 'ava';

import HttpResponse from '../../../lib/HttpResponse.js';

test('new HttpResponse()', (t) => {
  const request = new HttpResponse({});
  t.assert(request instanceof HttpResponse);
});

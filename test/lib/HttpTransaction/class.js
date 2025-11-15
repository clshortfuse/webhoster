import test from 'ava';

import HttpTransaction from '../../../lib/HttpTransaction.js';

test('new HttpTransaction()', (t) => {
  const req = new HttpTransaction({});
  t.assert(req instanceof HttpTransaction);
});

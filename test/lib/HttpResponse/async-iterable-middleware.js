import test from 'ava';
import { PassThrough } from 'node:stream';

import HttpHandler from '../../../lib/HttpHandler.js';
import HttpResponse from '../../../lib/HttpResponse.js';
import HttpTransaction from '../../../lib/HttpTransaction.js';

test('middleware can return async iterable body', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);

  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  const transaction = new HttpTransaction({ request: {}, response, socket: {}, httpVersion: '1.1' });

  const handler = new HttpHandler();

  // Middleware returns an async generator (async iterable)
  const mw = async () => {
    async function* gen() {
      yield Buffer.from('m1-');
      await new Promise((r) => setTimeout(r, 0));
      yield Buffer.from('m2');
    }
    return gen();
  };

  const result = await handler.processMiddleware(transaction, mw);
  t.truthy(result !== undefined);

  let out = '';
  for await (const chunk of reader) {
    out += chunk.toString();
  }

  t.is(out, 'm1-m2');
});

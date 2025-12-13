import test from 'ava';
import { PassThrough } from 'node:stream';

import HttpHandler from '../../../lib/HttpHandler.js';
import HttpResponse from '../../../lib/HttpResponse.js';

test('HttpResponse.send() accepts async iterable body', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);

  const response = new HttpResponse({ stream, onSendHeaders: () => {} });

  async function* gen() {
    yield Buffer.from('chunk1-');
    // allow microtask scheduling
    await new Promise((r) => setTimeout(r, 0));
    yield Buffer.from('chunk2');
  }

  response.body = gen();

  const result = await response.send();
  t.is(result, HttpHandler.END);

  let out = '';
  for await (const chunk of reader) {
    out += chunk.toString();
  }
  t.is(out, 'chunk1-chunk2');
});

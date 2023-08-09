import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';

import test from 'ava';

import HttpResponse from '../../lib/HttpResponse.js';
import SendJsonMiddleware from '../../middleware/SendJsonMiddleware.js';

test('new SendJsonMiddleware()', (t) => {
  const instance = new SendJsonMiddleware();
  t.assert(instance instanceof SendJsonMiddleware);
});

test('SendJsonMiddleware.execute()', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  let headersSent = false;
  const response = new HttpResponse({
    stream,
    onSendHeaders() {
      headersSent = true;
    },
  });
  const middleware = new SendJsonMiddleware();
  middleware.execute({ response });

  const jsonContent = {
    number: Math.floor(Math.random() * 10),
    date: new Date(Math.random() * Date.now()),
    string: randomBytes(48).toString('hex'),
    boolean: true,
    null: null,
    array: [
      1,
      2,
    ],
    object: {
      key: 'value',
    },
  };

  t.false(headersSent);
  await response.send(jsonContent);
  t.true(headersSent);

  for await (const chunk of reader) {
    const s = chunk.toString();
    const data = JSON.parse(s);
    t.deepEqual(data, {
      ...jsonContent,
      date: jsonContent.date.toISOString(),
    });
  }

  t.is(response.headers['content-type'], 'application/json;charset=utf-8');
});

import test from 'ava';
import { createHash } from 'node:crypto';
import { PassThrough } from 'node:stream';

import HttpResponse from '../../lib/HttpResponse.js';
import SendReadableMiddleware from '../../middleware/SendReadableMiddleware.js';
import { getTestBinaryStream, getTestHash } from '../fixtures/stream.js';

test('new SendReadableMiddleware()', (t) => {
  const instance = new SendReadableMiddleware();
  t.assert(instance instanceof SendReadableMiddleware);
});

test('SendReadableMiddleware.execute()', async (t) => {
  const hash = createHash('sha256');
  const res = new HttpResponse({ stream: hash });
  const middleware = new SendReadableMiddleware();
  middleware.execute({ res });
  const readable = getTestBinaryStream();
  t.true(readable.readable);
  t.false(readable.readableEnded);
  await res.send(readable);
  t.true(readable.readableEnded);
  t.false(readable.readable);
  t.is(hash.digest().toString('hex'), await getTestHash());
});

test('SendReadableMiddleware - unreadable stream', async (t) => {
  const stream = new PassThrough();
  const res = new HttpResponse({ stream });
  const middleware = new SendReadableMiddleware();
  middleware.execute({ res });
  const readable = getTestBinaryStream();
  t.true(readable.readable);
  t.false(readable.readableEnded);
  readable.destroy();
  t.false(readable.readable);
  const error = await t.throwsAsync(async () => await res.send(readable));
  t.is(error.message, 'NOT_READABLE');
});

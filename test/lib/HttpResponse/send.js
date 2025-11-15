import { PassThrough, pipeline } from 'node:stream';

import test from 'ava';

import HttpHandler from '../../../lib/HttpHandler.js';
import HttpResponse from '../../../lib/HttpResponse.js';

test('HttpResponse.sendStatusOnly() - header sent', async (t) => {
  const res = new HttpResponse({
    onHeadersSent: () => true,
    stream: new PassThrough(),
  });
  const error = await t.throwsAsync(() => res.sendStatusOnly(500));
  t.is(error.message, 'ERR_HEADER_SENT');
});

test('HttpResponse.sendStatusOnly() - not implemented', async (t) => {
  const res = new HttpResponse({
    onHeadersSent: () => false,
    stream: new PassThrough(),
  });
  const error = await t.throwsAsync(() => res.sendStatusOnly(500));
  t.is(error.message, 'NOT_IMPLEMENTED');
});

test('HttpResponse.sendStatusOnly() - not writable', async (t) => {
  const res = new HttpResponse({
    onHeadersSent: () => false,
    stream: new PassThrough(),
  });
  res.stream.destroy();
  const error = await t.throwsAsync(() => res.sendStatusOnly(500));
  t.is(error.message, 'NOT_WRITABLE');
});

test('HttpResponse.sendStatusOnly()', async (t) => {
  t.plan(3);
  const res = new HttpResponse({
    onHeadersSent: () => false,
    stream: new PassThrough(),
    onSendHeaders: (flush, end) => {
      t.true(end);
    },
  });
  const result = await res.sendStatusOnly(500);
  t.is(res.status, 500);
  t.is(result, HttpHandler.END);
});

test('HttpResponse.sendHeaders()', async (t) => {
  const res = new HttpResponse({
    stream: new PassThrough(),
    onSendHeaders: () => {},
  });
  t.false(res.headersSent);
  const result = await res.sendHeaders();
  t.true(res.headersSent);
});

test('HttpResponse.sendHeaders() - cannot resend', async (t) => {
  const res = new HttpResponse({
    stream: new PassThrough(),
    onSendHeaders: () => {},
  });
  t.false(res.headersSent);
  res.sendHeaders();
  t.true(res.headersSent);
  const error = t.throws(() => res.sendHeaders());
  t.is(error.message, 'HEADER_SENT');
});

test('HttpResponse.sendRaw()', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const res = new HttpResponse({ stream, onSendHeaders: () => {} });
  t.false(stream.writableEnded);
  const result = await res.sendRaw(Buffer.from('foo'));
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.is(chunk.toString(), 'foo');
  }
});

test('HttpResponse.send() - non-writable', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const res = new HttpResponse({ stream, onSendHeaders: () => {} });
  t.false(stream.destroyed);
  stream.destroy();
  const error = await t.throwsAsync(() => res.send(Buffer.from('foo')));
  t.is(error.message, 'NOT_WRITABLE');
});

test('HttpResponse.send() - null', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const res = new HttpResponse({ stream, onSendHeaders: () => {} });
  t.false(stream.writableEnded);
  const result = await res.send();
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.fail();
  }
});

test('HttpResponse.send() - content-handler typeof string', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  response.finalizers.push((res) => {
    if (typeof res.body === 'string') {
      res.body = Buffer.from(res.body, 'latin1');
    }
  });
  t.false(stream.writableEnded);
  const result = await response.send('foo');
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.true(Buffer.isBuffer(chunk));
    t.is(chunk.toString('latin1'), 'foo');
  }
});

test('HttpResponse.send() - content-handler instanceof Date', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  const d = new Date(0);
  response.finalizers.push((res) => {
    if (res.body instanceof Date) {
      res.body = Buffer.from(res.body.toISOString(), 'latin1');
    }
  });
  t.false(stream.writableEnded);
  const result = await response.send(d);
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.true(Buffer.isBuffer(chunk));
    t.is(chunk.toString('latin1'), d.toISOString());
  }
});

test('HttpResponse.send()', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const res = new HttpResponse({ stream, onSendHeaders: () => {} });
  t.false(stream.writableEnded);
  const result = await res.send(Buffer.from('foo'));
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.true(Buffer.isBuffer(chunk));
    t.is(chunk.toString(), 'foo');
  }
});

test('HttpResponse.end() - non-writable', async (t) => {
  t.plan(7);
  const stream = new PassThrough();
  const reader = new PassThrough();
  pipeline(stream, reader, (err) => {
    if (err) t.pass();
    else t.fail();
  });
  // stream.pipe(reader);
  const res = new HttpResponse({ stream, onSendHeaders: () => {} });
  t.false(stream.destroyed);
  stream.destroy();
  t.true(stream.destroyed);

  const result = res.end(Buffer.from('foo'));
  t.is(result, HttpHandler.END);
  t.false(stream.writableEnded);
  t.true(stream.destroyed);
  try {
    for await (const chunk of reader) {
      t.fail();
    }
  } catch {
    // Cannot read from destroyed stream;
    t.pass();
  }
});

test('HttpResponse.end() - content-handler typeof string', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({
    stream,
    onSendHeaders: () => {},
  });
  response.finalizers.push((res) => {
    if (typeof res.body === 'string') {
      res.body = Buffer.from(res.body, 'latin1');
    }
  });
  t.false(stream.writableEnded);
  const result = response.end('foo');
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.true(Buffer.isBuffer(chunk));
    t.is(chunk.toString('latin1'), 'foo');
  }
});

test('HttpResponse.end() - content-handler instanceof Date', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  const d = new Date(0);
  response.finalizers.push((res) => {
    if (res.body instanceof Date) {
      res.body = Buffer.from(res.body.toISOString(), 'latin1');
    }
  });
  t.false(stream.writableEnded);
  const result = response.end(d);
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.true(Buffer.isBuffer(chunk));
    t.is(chunk.toString('latin1'), d.toISOString());
  }
});

test('HttpResponse.end() - null', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const res = new HttpResponse({ stream, onSendHeaders: () => {} });
  t.false(stream.writableEnded);
  const result = res.end();
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.fail();
  }
});

test('HttpResponse.end()', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const res = new HttpResponse({ stream, onSendHeaders: () => {} });
  t.false(stream.writableEnded);
  const result = res.end(Buffer.from('foo'));
  t.is(result, HttpHandler.END);
  t.true(stream.writableEnded);

  for await (const chunk of reader) {
    t.true(Buffer.isBuffer(chunk));
    t.is(chunk.toString(), 'foo');
  }
});

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
  const response = new HttpResponse({
    stream,
    onSendHeaders: () => {},
  });
  const middleware = new SendJsonMiddleware();
  middleware.execute({ response });

  /** @type {any} */
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

  await response.send(jsonContent);

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

test('SendJsonMiddleware.Execute() (static)', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({
    stream,
    onSendHeaders: () => {},
  });
  SendJsonMiddleware.Execute({ response });

  /** @type {any} */
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

  await response.send(jsonContent);

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

test('SendJsonMiddleware.charsetAsBufferEncoding covers all branches', (t) => {
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('utf-8'), 'utf-8');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('utf8'), 'utf-8');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('latin1'), 'latin1');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('iso-8859-1'), 'latin1');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('ascii'), 'latin1');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('binary'), 'latin1');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('utf16le'), 'utf16le');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('utf-16le'), 'utf16le');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('ucs-2'), 'utf16le');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('ucs2'), 'utf16le');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('base64'), 'base64');
  t.is(SendJsonMiddleware.charsetAsBufferEncoding('hex'), 'hex');
});

test('SendJsonMiddleware: setMediaType false but setCharset true appends charset only', async (t) => {
  const stream = new PassThrough();
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  const middleware = new SendJsonMiddleware({ setMediaType: false });
  middleware.execute({ response });
  await response.send({ foo: 'bar' });
  t.is(response.headers['content-type'], ';charset=utf-8');
});

test('SendJsonMiddleware: setCharset false still sets application/json', async (t) => {
  const stream = new PassThrough();
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  const middleware = new SendJsonMiddleware({ setCharset: false });
  middleware.execute({ response });
  await response.send({ foo: 'bar' });
  t.is(response.headers['content-type'], 'application/json');
});

test('SendJsonMiddleware: setMediaType false and setCharset false does not set content-type', async (t) => {
  const stream = new PassThrough();
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  const middleware = new SendJsonMiddleware({ setMediaType: false, setCharset: false });
  middleware.execute({ response });
  await response.send({ foo: 'bar' });
  t.falsy(response.headers['content-type']);
});

test('SendJsonMiddleware: custom defaultCharset (latin1)', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  const middleware = new SendJsonMiddleware({ defaultCharset: 'latin1' });
  middleware.execute({ response });
  await response.send({ foo: 'bär' });
  t.regex(String(response.headers['content-type']), /charset=latin1/);
  for await (const chunk of reader) {
    t.is(chunk.toString('latin1'), JSON.stringify({ foo: 'bär' }));
  }
});

test('SendJsonMiddleware: respects existing content-type with charset', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  response.headers['content-type'] = 'application/json; charset=utf-16le';
  const middleware = new SendJsonMiddleware();
  middleware.execute({ response });
  await response.send({ foo: 'bar' });
  t.regex(String(response.headers['content-type']), /charset=utf-16le/);
  for await (const chunk of reader) {
    t.is(chunk.toString('utf16le'), JSON.stringify({ foo: 'bar' }));
  }
});

test('SendJsonMiddleware: adds charset if content-type is just "application/json"', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  response.headers['content-type'] = 'application/json';
  const middleware = new SendJsonMiddleware();
  middleware.execute({ response });
  await response.send({ foo: 'bar' });
  t.is(response.headers['content-type'], 'application/json;charset=utf-8');
  for await (const chunk of reader) {
    t.is(chunk.toString('utf-8'), JSON.stringify({ foo: 'bar' }));
  }
});

test('SendJsonMiddleware: quoted charset in content-type', async (t) => {
  const stream = new PassThrough();
  const reader = new PassThrough();
  stream.pipe(reader);
  const response = new HttpResponse({ stream, onSendHeaders: () => {} });
  response.headers['content-type'] = 'application/json; charset="utf-8"';
  const middleware = new SendJsonMiddleware();
  middleware.execute({ response });
  await response.send({ foo: 'bar' });
  t.regex(String(response.headers['content-type']), /charset="?utf-8"?/);
  for await (const chunk of reader) {
    t.is(chunk.toString('utf-8'), JSON.stringify({ foo: 'bar' }));
  }
});

test('SendJsonMiddleware: does nothing for streaming response', (t) => {
  const response = new HttpResponse({ stream: new PassThrough(), onSendHeaders: () => {} });
  response.isStreaming = true;
  const middleware = new SendJsonMiddleware();
  middleware.execute({ response });
  // Should not throw or modify body
  t.notThrows(() => { for (const function_ of response.finalizers) function_(response); });
});

test('SendJsonMiddleware: does nothing for Buffer body', (t) => {
  const response = new HttpResponse({ stream: new PassThrough(), onSendHeaders: () => {} });
  response.body = Buffer.from('foo');
  const middleware = new SendJsonMiddleware();
  middleware.execute({ response });
  t.notThrows(() => { for (const function_ of response.finalizers) function_(response); });
  t.true(Buffer.isBuffer(response.body));
});

test('SendJsonMiddleware: does nothing for null/undefined body', (t) => {
  const response = new HttpResponse({ stream: new PassThrough(), onSendHeaders: () => {} });
  response.body = null;
  const middleware = new SendJsonMiddleware();
  middleware.execute({ response });
  t.notThrows(() => { for (const function_ of response.finalizers) function_(response); });
  response.body = undefined;
  t.notThrows(() => { for (const function_ of response.finalizers) function_(response); });
});

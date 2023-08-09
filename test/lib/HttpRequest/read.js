import { createHash, randomBytes } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';

import test from 'ava';

import HttpRequest from '../../../lib/HttpRequest.js';
import {
  getTestBinaryStream, getTestHash, getTestString, getTestTextStream,
} from '../../fixtures/stream.js';

test('HttpRequest.readable', async (t) => {
  const request = new HttpRequest({ stream: getTestBinaryStream() });

  t.false(request.bodyUsed);

  /** @type {typeof import('node:stream/web').ReadableStream} */
  let ReadableStream;
  try {
    ({ ReadableStream } = (await import('node:stream/web')));
  } catch {}

  if (!ReadableStream || 'toWeb' in Readable === false) {
    t.log('Not supported.');
    const error = t.throws(() => request.readable, { instanceOf: Error });
    t.is(error.message, 'NOT_SUPPORTED');
    t.false(request.bodyUsed);
    return;
  }

  const stream = request.readable;
  t.true(request.bodyUsed);
  t.true(request.stream.readable);
  t.false(request.stream.readableEnded);

  t.assert(stream instanceof ReadableStream);

  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.write(Buffer.from(chunk));
  }
  const computedHash = hash.digest().toString('hex');
  const actualHash = await getTestHash();
  t.is(actualHash, computedHash);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);
});

test('HttpRequest.readable - GET', (t) => {
  const request = new HttpRequest({ method: 'GET' });

  t.false(request.bodyUsed);
  t.is(request.readable, null);
  t.false(request.bodyUsed);
});

test('HttpRequest.buffer()', async (t) => {
  const request = new HttpRequest({ stream: getTestBinaryStream() });

  t.false(request.bodyUsed);
  const data = await request.buffer();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(Buffer.isBuffer(data));
  // t.is(data.length, BUFFER_SIZE);

  const hash = createHash('sha256');
  hash.write(data);
  const computedHash = hash.digest().toString('hex');
  const actualHash = await getTestHash();
  t.is(actualHash, computedHash);
});

test('HttpRequest.buffer() - MAX_BUFFER_SIZE_REACHED', async (t) => {
  let streamConsumers;
  try {
    streamConsumers = await import(new URL('node:stream/consumers').toString());
  } catch {}

  if (streamConsumers) {
    t.log('Not supported.');
    t.pass();
    return;
  }
  const request = new HttpRequest({ stream: getTestBinaryStream() });

  t.false(request.bodyUsed);
  request.MIN_INITIAL_BUFFER_SIZE = 64;
  request.MAX_INITIAL_BUFFER_SIZE = 128;
  request.MAX_BUFFER_SIZE = 1024;
  const error = await t.throwsAsync(async () => await request.buffer());
  t.is(error.message, 'MAX_BUFFER_SIZE_REACHED');
});

test('HttpRequest.buffer() - content-length invalid', async (t) => {
  let streamConsumers;
  try {
    streamConsumers = await import(new URL('node:stream/consumers').toString());
  } catch {}

  if (streamConsumers) {
    t.log('Not supported.');
    t.pass();
    return;
  }

  const request = new HttpRequest({
    stream: getTestBinaryStream(),
    headers: {
      'content-length': '100',
    },
  });

  t.false(request.bodyUsed);
  const data = await request.buffer();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(Buffer.isBuffer(data));
  // t.is(data.length, BUFFER_SIZE);

  const hash = createHash('sha256');
  hash.write(data);
  const computedHash = hash.digest().toString('hex');
  const actualHash = await getTestHash();
  t.is(actualHash, computedHash);
});

test('HttpRequest.buffer() - encode string back', async (t) => {
  const text = 'foo';
  const source = Readable.from([Buffer.from(text)]);
  const downstream = new PassThrough();
  downstream.setEncoding('utf8');
  const request = new HttpRequest({ stream: source, headers: {} });
  request.addDownstream(downstream);
  const data = await request.buffer();
  t.true(Buffer.isBuffer(data));
  t.is(data.toString(), text);
});

test('HttpRequest.arrayBuffer()', async (t) => {
  const request = new HttpRequest({ stream: getTestBinaryStream() });

  t.false(request.bodyUsed);
  const data = await request.arrayBuffer();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(data instanceof ArrayBuffer);
  // t.is(data.byteLength, BUFFER_SIZE);

  const hash = createHash('sha256');
  hash.write(Buffer.from(data));
  const computedHash = hash.digest().toString('hex');
  const actualHash = await getTestHash();
  t.is(actualHash, computedHash);
});

test('HttpRequest.blob()', async (t) => {
  const contentType = 'application/octet-stream';
  const request = new HttpRequest({
    stream: getTestBinaryStream(),
    headers: {
      'content-type': contentType,
    },
  });

  t.false(request.bodyUsed);

  let BlobClass = (typeof Blob === 'undefined' ? undefined : Blob);
  try {
    if (!BlobClass) {
      BlobClass = (await import('node:buffer')).Blob;
    }
  } catch {}

  /** @type {import('stream/consumers')} */
  let streamConsumers;
  try {
    streamConsumers = await import(new URL('node:stream/consumers').toString());
  } catch {}

  if (!BlobClass && (!streamConsumers || !streamConsumers.blob)) {
    t.log('Not supported.');
    const error = await t.throwsAsync(async () => await request.blob(), { instanceOf: Error });
    t.is(error.message, 'NOT_SUPPORTED');
    t.false(request.bodyUsed);
    return;
  }

  const data = await request.blob();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  if (BlobClass) {
    t.assert(data instanceof BlobClass);
  } else {
    t.is(data.toString(), '[object Blob]');
  }
  t.is(data.type, contentType);
  // t.is(data.size, BUFFER_SIZE);

  const hash = createHash('sha256');
  hash.write(Buffer.from(await data.arrayBuffer()));
  const computedHash = hash.digest().toString('hex');
  const actualHash = await getTestHash();
  t.is(actualHash, computedHash);
});

test('HttpRequest.blob() - no content-type', async (t) => {
  const request = new HttpRequest({
    stream: getTestBinaryStream(),
    headers: {},
  });

  t.false(request.bodyUsed);

  let BlobClass = (typeof Blob === 'undefined' ? undefined : Blob);
  try {
    if (!BlobClass) {
      BlobClass = (await import('node:buffer')).Blob;
    }
  } catch {}

  /** @type {import('stream/consumers')} */
  let streamConsumers;
  try {
    streamConsumers = await import(new URL('node:stream/consumers').toString());
  } catch {}

  if (!BlobClass && (!streamConsumers || !streamConsumers.blob)) {
    t.log('Not supported.');
    const error = await t.throwsAsync(async () => await request.blob(), { instanceOf: Error });
    t.is(error.message, 'NOT_SUPPORTED');
    t.false(request.bodyUsed);
    return;
  }

  const data = await request.blob();

  t.falsy(data.type);
});

test('HttpRequest.text()', async (t) => {
  const request = new HttpRequest({
    stream: getTestTextStream(),
    headers: {},
  });

  t.false(request.bodyUsed);
  const data = await request.text();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'string');
  t.is(data, getTestString());
});

test('HttpRequest.text() - utf16', async (t) => {
  const text = '\u{FF11}\u{FF12}\u{FF13}\u{FF14}';
  const buffer = Buffer.from('\u{FF11}\u{FF12}\u{FF13}\u{FF14}', 'utf16le');
  const request = new HttpRequest({
    stream: Readable.from([buffer]),
    headers: {
      'content-type': 'text/plain;charset=ucs-2',
    },
  });

  t.false(request.bodyUsed);
  const data = await request.text();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'string');
  t.is(data, text);
  t.is(text.length, 4);
});

test('HttpRequest.json() - Object', async (t) => {
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

  const request = new HttpRequest({
    stream: Readable.from([Buffer.from(JSON.stringify(jsonContent))]),
    headers: {},
  });

  t.false(request.bodyUsed);
  const data = await request.json();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'object');

  t.deepEqual(data, {
    ...jsonContent,
    date: jsonContent.date.toISOString(),
  });
});

test('HttpRequest.json() - Array', async (t) => {
  const jsonContent = [
    1,
    2,
  ];

  const request = new HttpRequest({
    stream: Readable.from([Buffer.from(JSON.stringify(jsonContent))]),
    headers: {},
  });

  t.false(request.bodyUsed);
  const data = await request.json();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'object');

  t.deepEqual(data, jsonContent);
});

test('HttpRequest.formData - error', async (t) => {
  const request = new HttpRequest({});
  const error = await t.throwsAsync(async () => await request.formData());
  t.is(error.message, 'UNSUPPORTED_MEDIA_TYPE');
});

test('HttpRequest.read() - GET', async (t) => {
  const url = 'http://my.domain.name/pathname?foo=bar&baz=qux&q1=a&q1=b#hash';
  const parsedURL = new URL(url);
  const request = new HttpRequest({ method: 'GET', url, query: parsedURL.search });

  /** @type {URLSearchParams} */
  const data = await request.read();
  t.true(data instanceof URLSearchParams);
  t.is(data.get('foo'), 'bar');
  t.is(data.get('baz'), 'qux');
  // eslint-disable-next-line unicorn/prefer-set-has
  const keys = [...data.keys()];
  t.true(keys.includes('foo'));
  t.true(keys.includes('baz'));
  t.true(keys.includes('q1'));
  t.is(data.get('q1'), 'a');
  t.deepEqual(data.getAll('q1'), ['a', 'b']);
});

test('HttpRequest.read() - No content-type (buffer)', async (t) => {
  const request = new HttpRequest({ stream: getTestBinaryStream(), headers: {} });

  t.false(request.bodyUsed);
  const data = await request.read();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(Buffer.isBuffer(data));
  // t.is(data.length, BUFFER_SIZE);

  const hash = createHash('sha256');
  hash.write(data);
  const computedHash = hash.digest().toString('hex');
  const actualHash = await getTestHash();
  t.is(actualHash, computedHash);
});

test('HttpRequest.read() - No content-type (string)', async (t) => {
  const request = new HttpRequest({ stream: Readable.from(['foo', 'bar']), headers: {} });

  t.false(request.bodyUsed);
  const data = await request.read();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'string');
  // t.is(data.length, BUFFER_SIZE);

  t.is(data, 'foobar');
});

test('HttpRequest.read() - No content-type (object-stream)', async (t) => {
  const jsonContent = { foo: 'bar' };
  const request = new HttpRequest({ stream: Readable.from([jsonContent]), headers: {} });

  t.false(request.bodyUsed);
  const data = await request.read();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'object');
  // t.is(data.length, BUFFER_SIZE);

  t.deepEqual(data, jsonContent);
});

test('HttpRequest.read() - No content-type (null)', async (t) => {
  const request = new HttpRequest({ stream: Readable.from([]), headers: {} });

  t.false(request.bodyUsed);
  const data = await request.read();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);
  t.is(data, null);
});

test('HttpRequest.read() - application/json', async (t) => {
  const jsonContent = { hello: 'world' };
  const testString = JSON.stringify(jsonContent);
  const request = new HttpRequest({
    stream: Readable.from([Buffer.from(testString)]),
    headers: {
      'content-type': 'application/json;charset=utf-8',
    },
  });

  t.false(request.bodyUsed);
  const data = await request.read();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'object');
  t.deepEqual(data, jsonContent);
});

test('HttpRequest.read() - text/plain', async (t) => {
  const jsonContent = { hello: 'world' };
  const testString = JSON.stringify(jsonContent);
  const request = new HttpRequest({
    stream: Readable.from([Buffer.from(testString)]),
    headers: {
      'content-type': 'text/plain;charset=utf-8',
    },
  });

  t.false(request.bodyUsed);
  const data = await request.read();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'string');
  t.is(data, testString);
});

test('HttpRequest.read() - application/vnd.api+json', async (t) => {
  const jsonContent = { hello: 'world' };
  const testString = JSON.stringify(jsonContent);
  const request = new HttpRequest({
    stream: Readable.from([Buffer.from(testString)]),
    headers: {
      'content-type': 'application/vnd.api+json;charset=utf-8',
    },
  });

  t.false(request.bodyUsed);
  const data = await request.read();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'object');
  t.deepEqual(data, jsonContent);
});

test('HttpRequest.read() - contentReaders filtering', async (t) => {
  const jsonContent = { hello: 'world' };
  const testString = JSON.stringify(jsonContent);
  const request = new HttpRequest({
    stream: Readable.from([Buffer.from(testString)]),
    headers: {
      'content-type': 'application/vnd.api;charset=utf-8',
    },
  });
  request.contentReaders.push(
    {
      type: 'application', subtype: 'api', tree: 'vnd2', parse: request.text,
    },
    {
      type: 'application', subtype: 'api', tree: 'vnd', test: () => false, parse: request.text,
    },
    {
      type: 'application', subtype: 'api', tree: 'vnd', parse: request.json,
    },
  );

  t.false(request.bodyUsed);
  const data = await request.read();
  t.true(request.bodyUsed);
  t.false(request.stream.readable);
  t.true(request.stream.readableEnded);

  t.assert(typeof data === 'object');
  t.deepEqual(data, jsonContent);
});

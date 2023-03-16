import { PassThrough, Readable } from 'node:stream';

import test from 'ava';

import HttpRequest from '../../../lib/HttpRequest.js';

test('HttpRequest.addDownstream() - notreadable', (t) => {
  const source = Readable.from(['foo']);
  const req = new HttpRequest({ stream: source });
  t.true(req.stream.readable);
  req.stream.destroy();
  t.false(req.stream.readable);
  const error = t.throws(() => req.addDownstream(new PassThrough()));
  t.assert(error.message, 'STREAM_NOT_READABLE');
});

test('HttpRequest.addDownstream() - forwardErrors optional', (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });
  req.addDownstream(downstream);
  t.plan(2);
  source.addListener('error', (err) => {
    t.assert(err.message, 'TEST');
  });
  downstream.addListener('error', (err) => {
    t.assert(err.message, 'TEST');
  });
  downstream.emit('error', new Error('TEST'));
});

test('HttpRequest.addDownstream() - forwardErrors true', (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });
  req.addDownstream(downstream, { forwardErrors: true });
  t.plan(2);
  source.addListener('error', (err) => {
    t.assert(err.message, 'TEST');
  });
  downstream.addListener('error', (err) => {
    t.assert(err.message, 'TEST');
  });
  downstream.emit('error', new Error('TEST'));
});

test('HttpRequest.addDownstream() - forwardErrors false', (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });
  req.addDownstream(downstream, { forwardErrors: false });
  t.plan(1);
  source.addListener('error', (err) => {
    t.fail('Error should not have been called');
  });
  downstream.addListener('error', (err) => {
    t.assert(err.message, 'TEST');
  });
  downstream.emit('error', new Error('TEST'));
});

test('HttpRequest.addDownstream() - destroy on external consumption', async (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });
  req.addDownstream(downstream, { autoPipe: false });
  t.true(source.readable);
  t.false(source.readableEnded);

  // Consume outside
  for await (const chunk of source) {
    t.is(chunk, 'foo');
  }
  t.false(source.readable);
  t.true(source.readableEnded);

  t.false(downstream.readable);
});

test('HttpRequest.addDownstream() - destroy on external destroy', async (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });
  req.addDownstream(downstream, { autoPipe: false });
  t.true(source.readable);

  source.destroy();
  t.false(source.readable);

  // 'close' event only occurs on next cycle
  await new Promise((r) => setImmediate(r));
  t.false(downstream.readable);
});

test('HttpRequest.addDownstream() - autoPipe', async (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });

  t.is(downstream.listenerCount('unpipe'), 0);
  req.addDownstream(downstream);
  t.is(downstream.listenerCount('unpipe'), 1);

  for await (const chunk of downstream) {
    t.is(chunk.toString(), 'foo');
  }

  t.false(source.readable);
  t.true(source.readableEnded);

  t.false(downstream.readable);
  t.true(downstream.readableEnded);
});

test('HttpRequest.addDownstream() - autoPipe true', async (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });

  t.is(downstream.listenerCount('unpipe'), 0);
  req.addDownstream(downstream, { autoPipe: true });
  t.is(downstream.listenerCount('unpipe'), 1);
});

test('HttpRequest.addDownstream() - autoPipe false', async (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });

  t.is(downstream.listenerCount('unpipe'), 0);
  req.addDownstream(downstream, { autoPipe: false });
  t.is(downstream.listenerCount('unpipe'), 0);
});

test('HttpRequest.addDownstream() - autoPause', async (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });

  req.addDownstream(downstream);
  t.false(source.isPaused());
});

test('HttpRequest.addDownstream() - autoPause true', async (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });

  req.addDownstream(downstream, { autoPause: true });
  t.true(source.isPaused());
});

test('HttpRequest.addDownstream() - autoPause false', async (t) => {
  const source = Readable.from(['foo']);
  const downstream = new PassThrough();
  const req = new HttpRequest({ stream: source });

  req.addDownstream(downstream, { autoPipe: false });
  t.false(source.isPaused());
});

test('HttpRequest.addDownstream() - string encoder text()', async (t) => {
  const text = 'foo';
  const source = Readable.from([Buffer.from(text)]);
  const downstream = new PassThrough();
  downstream.setEncoding('utf8');
  const req = new HttpRequest({ stream: source, headers: {} });
  req.addDownstream(downstream);
  const data = await req.text();
  t.is(data, text);
});

import test from 'ava';
import { PassThrough } from 'node:stream';

import HttpResponse from '../../../lib/HttpResponse.js';

test('HttpResponse.canPushPath', (t) => {
  t.false(new HttpResponse({}).canPushPath);

  t.true(new HttpResponse({ canPushPath: true }).canPushPath);

  t.false(new HttpResponse({ canPushPath: false }).canPushPath);

  t.false(new HttpResponse({ canPushPath: () => false }).canPushPath);

  t.true(new HttpResponse({ canPushPath: () => true }).canPushPath);
});

test('HttpResponse.pushPath - not supported', async (t) => {
  const req = new HttpResponse({});
  t.false(req.canPushPath);
  const error = await t.throwsAsync(() => req.pushPath());
  t.is(error.message, 'NOT_SUPPORTED');
});

test('HttpResponse.pushPath - not implemented', async (t) => {
  const req = new HttpResponse({ canPushPath: true });
  const error = await t.throwsAsync(() => req.pushPath());
  t.is(error.message, 'NOT_IMPLEMENTED');
});

test('HttpResponse.pushPath - canPushPath guard ', async (t) => {
  let testValue = false;
  const req = new HttpResponse({
    canPushPath: false,
    onPushPath() { testValue = true; },
  });
  t.false(testValue);
  await t.throwsAsync(() => req.pushPath());
  t.false(testValue);
});

test('HttpResponse.pushPath - already pushed ', async (t) => {
  let testValue = false;
  const req = new HttpResponse({
    canPushPath: true,
    onPushPath: (path) => { testValue = true; },
  });
  t.false(testValue);
  await req.pushPath('/styles.css');
  t.true(testValue);
  const error = await t.throwsAsync(() => req.pushPath('/styles.css'));
  t.is(error.message, 'ALREADY_PUSHED');
});

test('HttpResponse.pushPath', async (t) => {
  let testValue = false;
  const req = new HttpResponse({
    canPushPath: true,
    onPushPath: () => { testValue = true; },
  });
  t.false(testValue);
  await req.pushPath('/styles.css');
  t.true(testValue);
  await req.pushPath('/script.js');
});

test('HttpResponse.pushPath - failure', async (t) => {
  const req = new HttpResponse({
    canPushPath: true,
    onPushPath: (path) => {
      if (path === '/styles.css') throw new Error('TEST');
    },
  });
  t.deepEqual(req.pushedPaths, []);
  const error = await t.throwsAsync(() => req.pushPath('/styles.css'));
  t.is(error.message, 'TEST');
  await req.pushPath('/script.js');
  t.deepEqual(req.pushedPaths, ['/script.js']);
});

test('HttpResponse.pushedPaths', async (t) => {
  const req = new HttpResponse({
    canPushPath: true,
    onPushPath: () => {},
  });
  t.deepEqual(req.pushedPaths, []);
  await req.pushPath('/styles.css');
  await req.pushPath('/script.js');
  t.deepEqual(req.pushedPaths, ['/styles.css', '/script.js']);
});

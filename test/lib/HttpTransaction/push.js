import test from 'ava';

import HttpTransaction from '../../../lib/HttpTransaction.js';

test('HttpTransaction.canPushPath', (t) => {
  t.false(new HttpTransaction({}).canPushPath);

  t.true(new HttpTransaction({ canPushPath: true }).canPushPath);

  t.false(new HttpTransaction({ canPushPath: false }).canPushPath);

  t.false(new HttpTransaction({ canPushPath: () => false }).canPushPath);

  t.true(new HttpTransaction({ canPushPath: () => true }).canPushPath);
});

test('HttpTransaction.pushPath - not supported', async (t) => {
  const request = new HttpTransaction({});
  t.false(request.canPushPath);
  const error = await t.throwsAsync(() => request.pushPath());
  t.is(error.message, 'NOT_SUPPORTED');
});

test('HttpTransaction.pushPath - not implemented', async (t) => {
  const request = new HttpTransaction({ canPushPath: true });
  const error = await t.throwsAsync(() => request.pushPath());
  t.is(error.message, 'NOT_IMPLEMENTED');
});

test('HttpTransaction.pushPath - canPushPath guard ', async (t) => {
  let testValue = false;
  const request = new HttpTransaction({
    canPushPath: false,
    onPushPath() { testValue = true; },
  });
  t.false(testValue);
  await t.throwsAsync(() => request.pushPath());
  t.false(testValue);
});

test('HttpTransaction.pushPath - already pushed ', async (t) => {
  let testValue = false;
  const request = new HttpTransaction({
    canPushPath: true,
    onPushPath: (path) => { testValue = true; },
  });
  t.false(testValue);
  await request.pushPath('/styles.css');
  t.true(testValue);
  const error = await t.throwsAsync(() => request.pushPath('/styles.css'));
  t.is(error.message, 'ALREADY_PUSHED');
});

test('HttpTransaction.pushPath', async (t) => {
  let testValue = false;
  const request = new HttpTransaction({
    canPushPath: true,
    onPushPath: () => { testValue = true; },
  });
  t.false(testValue);
  await request.pushPath('/styles.css');
  t.true(testValue);
  await request.pushPath('/script.js');
});

test('HttpTransaction.pushPath - failure', async (t) => {
  const request = new HttpTransaction({
    canPushPath: true,
    onPushPath: (path) => {
      if (path === '/styles.css') throw new Error('TEST');
    },
  });
  t.deepEqual(request.pushedPaths, []);
  const error = await t.throwsAsync(() => request.pushPath('/styles.css'));
  t.is(error.message, 'TEST');
  await request.pushPath('/script.js');
  t.deepEqual(request.pushedPaths, ['/script.js']);
});

test('HttpTransaction.pushedPaths', async (t) => {
  const request = new HttpTransaction({
    canPushPath: true,
    onPushPath: () => {},
  });
  t.deepEqual(request.pushedPaths, []);
  await request.pushPath('/styles.css');
  await request.pushPath('/script.js');
  t.deepEqual(request.pushedPaths, ['/styles.css', '/script.js']);
});

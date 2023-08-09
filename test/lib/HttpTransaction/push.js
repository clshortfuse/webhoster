import { PassThrough } from 'node:stream';
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
  const transaction = new HttpTransaction({});
  t.false(transaction.canPushPath);
  const error = await t.throwsAsync(async () => await transaction.pushPath());
  t.is(error.message, 'NOT_SUPPORTED');
});

test('HttpTransaction.pushPath - not implemented', async (t) => {
  const transaction = new HttpTransaction({ canPushPath: true });
  const error = await t.throwsAsync(async () => await transaction.pushPath());
  t.is(error.message, 'NOT_IMPLEMENTED');
});

test('HttpTransaction.pushPath - canPushPath guard ', async (t) => {
  let testValue = false;
  const transaction = new HttpTransaction({
    canPushPath: false,
    onPushPath() { testValue = true; },
  });
  t.false(testValue);
  await t.throwsAsync(async () => await transaction.pushPath());
  t.false(testValue);
});

test('HttpTransaction.pushPath - already pushed ', async (t) => {
  let testValue = false;
  const transaction = new HttpTransaction({
    canPushPath: true,
    onPushPath: (path) => { testValue = true; },
  });
  t.false(testValue);
  await transaction.pushPath('/styles.css');
  t.true(testValue);
  const error = await t.throwsAsync(async () => await transaction.pushPath('/styles.css'));
  t.is(error.message, 'ALREADY_PUSHED');
});

test('HttpTransaction.pushPath', async (t) => {
  let testValue = false;
  const transaction = new HttpTransaction({
    canPushPath: true,
    onPushPath: () => { testValue = true; },
  });
  t.false(testValue);
  await transaction.pushPath('/styles.css');
  t.true(testValue);
  await transaction.pushPath('/script.js');
});

test('HttpTransaction.pushPath - failure', async (t) => {
  const transaction = new HttpTransaction({
    canPushPath: true,
    onPushPath: (path) => {
      if (path === '/styles.css') throw new Error('TEST');
    },
  });
  t.deepEqual(transaction.pushedPaths, []);
  const error = await t.throwsAsync(async () => await transaction.pushPath('/styles.css'));
  t.is(error.message, 'TEST');
  await transaction.pushPath('/script.js');
  t.deepEqual(transaction.pushedPaths, ['/script.js']);
});

test('HttpTransaction.pushedPaths', async (t) => {
  const transaction = new HttpTransaction({
    canPushPath: true,
    onPushPath: () => {},
  });
  t.deepEqual(transaction.pushedPaths, []);
  await transaction.pushPath('/styles.css');
  await transaction.pushPath('/script.js');
  t.deepEqual(transaction.pushedPaths, ['/styles.css', '/script.js']);
});

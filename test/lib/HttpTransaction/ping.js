import test from 'ava';

import HttpTransaction from '../../../lib/HttpTransaction.js';

test('HttpTransaction.canPing', (t) => {
  t.false(new HttpTransaction({}).canPing);

  t.true(new HttpTransaction({ canPing: true }).canPing);

  t.false(new HttpTransaction({ canPing: false }).canPing);

  t.false(new HttpTransaction({ canPing: () => false }).canPing);

  t.true(new HttpTransaction({ canPing: () => true }).canPing);
});

test('HttpTransaction.ping - not supported', async (t) => {
  const transaction = new HttpTransaction({});
  t.false(transaction.canPing);
  const error = await t.throwsAsync(async () => await transaction.ping());
  t.is(error.message, 'NOT_SUPPORTED');
});

test('HttpTransaction.ping - not implemented', async (t) => {
  const transaction = new HttpTransaction({ canPing: true });
  const error = await t.throwsAsync(async () => await transaction.ping());
  t.is(error.message, 'NOT_IMPLEMENTED');
});

test('HttpTransaction.ping - canPing guard ', async (t) => {
  let testValue = false;
  const transaction = new HttpTransaction({
    canPing: false,
    onPing() { testValue = true; },
  });
  t.false(testValue);
  await t.throwsAsync(async () => await transaction.ping());
  t.false(testValue);
});

test('HttpTransaction.ping', async (t) => {
  let testValue = false;
  const transaction = new HttpTransaction({
    canPing: true,
    onPing: () => { testValue = true; },
  });
  t.false(testValue);
  await transaction.ping();
  t.true(testValue);
});

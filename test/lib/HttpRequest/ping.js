import test from 'ava';

import HttpRequest from '../../../lib/HttpRequest.js';

test('HttpRequest.canPing', (t) => {
  t.false(new HttpRequest({}).canPing);

  t.true(new HttpRequest({ canPing: true }).canPing);

  t.false(new HttpRequest({ canPing: false }).canPing);

  t.false(new HttpRequest({ canPing: () => false }).canPing);

  t.true(new HttpRequest({ canPing: () => true }).canPing);
});

test('HttpRequest.ping - not supported', async (t) => {
  const req = new HttpRequest({});
  t.false(req.canPing);
  const error = await t.throwsAsync(() => req.ping());
  t.is(error.message, 'NOT_SUPPORTED');
});

test('HttpRequest.ping - not implemented', async (t) => {
  const req = new HttpRequest({ canPing: true });
  const error = await t.throwsAsync(() => req.ping());
  t.is(error.message, 'NOT_IMPLEMENTED');
});

test('HttpRequest.ping - canPing guard ', async (t) => {
  let testValue = false;
  const req = new HttpRequest({
    canPing: false,
    onPing() { testValue = true; },
  });
  t.false(testValue);
  await t.throwsAsync(() => req.ping());
  t.false(testValue);
});

test('HttpRequest.ping', async (t) => {
  let testValue = false;
  const req = new HttpRequest({
    canPing: true,
    onPing: () => { testValue = true; },
  });
  t.false(testValue);
  await req.ping();
  t.true(testValue);
});

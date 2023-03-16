import test from 'ava';

test('sync test', (t) => {
  t.pass();
});

test('async test', async (t) => {
  const bar = Promise.resolve('bar');
  t.is(await bar, 'bar');
});

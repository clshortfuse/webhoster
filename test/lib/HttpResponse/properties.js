import test from 'ava';

import HttpResponse from '../../../lib/HttpResponse.js';

test('HttpResponse.URL', (t) => {
  const url = 'http://my.domain.name/pathname?foo=bar&baz=qux/#hash';
  const res = new HttpResponse({ url });

  t.is(url, res.url);

  const urlObject = res.URL;

  t.assert(urlObject instanceof URL);
  t.is(url, urlObject.toString());
});

test('HttpResponse.status - constructor', (t) => {
  const res = new HttpResponse({ status: 500 });
  t.is(res.status, 500);
});

test('HttpResponse.status - .status', (t) => {
  const res = new HttpResponse({});
  res.status = 500;
  t.is(res.status, 500);
});

test('HttpResponse.status - .statusCode', (t) => {
  const res = new HttpResponse({});
  res.statusCode = 500;
  t.is(res.statusCode, 500);
  t.is(res.status, 500);
});

test('HttpResponse.status - code()', (t) => {
  const res = new HttpResponse({});
  const result = res.code(500);
  t.is(res.status, 500);
  t.is(res, result);
});

test('HttpResponse.status - setStatus()', (t) => {
  const res = new HttpResponse({});
  const result = res.setStatus(500);
  t.is(res.status, 500);
  t.is(res, result);
});

test('HttpResponse.status - setStatus() error', (t) => {
  const res = new HttpResponse({
    onHeadersSent: () => true,
  });
  const error = t.throws(() => res.setStatus(500));
  t.is(error.message, 'ERR_HEADER_SENT');
});

test('HttpResponse.ok', (t) => {
  t.false(new HttpResponse({}).ok);
  t.false(new HttpResponse({ status: 500 }).ok);
  t.true(new HttpResponse({ status: 204 }).ok);
  t.true(new HttpResponse({ status: 200 }).ok);
  t.true(new HttpResponse({ status: 299 }).ok);
  t.false(new HttpResponse({ status: 300 }).ok);
});

test('HttpResponse.ok - writable', (t) => {
  const res = new HttpResponse({});
  t.false(res.ok);
  t.true(res.code(200).ok);
  t.false(res.code(500).ok);
});

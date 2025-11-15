import test from 'ava';

import HttpHandler from '../../../lib/HttpHandler.js';

test('HttpHandler.ParseResultSync returns correct flow instructions', (t) => {
  t.is(HttpHandler.ParseResultSync(true), HttpHandler.CONTINUE);
  t.is(HttpHandler.ParseResultSync(null), HttpHandler.CONTINUE);
  t.is(HttpHandler.ParseResultSync(undefined), HttpHandler.CONTINUE);
  t.is(HttpHandler.ParseResultSync(HttpHandler.CONTINUE), HttpHandler.CONTINUE);
  t.is(HttpHandler.ParseResultSync(false), HttpHandler.BREAK);
  t.is(HttpHandler.ParseResultSync(HttpHandler.BREAK), HttpHandler.BREAK);
  t.is(HttpHandler.ParseResultSync(0), HttpHandler.END);
  t.is(HttpHandler.ParseResultSync(HttpHandler.END), HttpHandler.END);
  t.is(HttpHandler.ParseResultSync('other'), null);
});

test('HttpHandler.parseURL parses basic URL', (t) => {
  const url = HttpHandler.parseURL('http', 'localhost:8080', '/foo/bar?baz=1#frag');
  t.is(url.href, 'http://localhost:8080/foo/bar?baz=1#frag');
  t.is(url.origin, 'http://localhost:8080');
  t.is(url.protocol, 'http:');
  t.is(url.host, 'localhost:8080');
  t.is(url.hostname, 'localhost');
  t.is(url.port, '8080');
  t.is(url.pathname, '/foo/bar');
  t.is(url.search, '?baz=1');
  t.is(url.hash, '#frag');
  t.is(url.query, 'baz=1');
  t.is(url.fragment, 'frag');
  t.is(url.url, 'http://localhost:8080/foo/bar?baz=1#frag');
});

test('HttpHandler.parseURL parses URL with no query or fragment', (t) => {
  const url = HttpHandler.parseURL('https', 'example.com', '/path');
  t.is(url.href, 'https://example.com/path');
  t.is(url.pathname, '/path');
  t.is(url.search, '');
  t.is(url.hash, '');
  t.is(url.query, '');
  t.is(url.fragment, '');
});

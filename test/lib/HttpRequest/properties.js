import test from 'ava';

import HttpRequest from '../../../lib/HttpRequest.js';

test('HttpRequest.URL', (t) => {
  const url = 'http://my.domain.name/pathname?foo=bar&baz=qux/#hash';
  const request = new HttpRequest({ url });

  t.is(url, request.url);

  t.assert(typeof request.url === 'string');
  t.is(url, request.url);
});

test('HttpRequest.mediaType', (t) => {
  /** @type {Record<string, Partial<import('../../../lib/HttpRequest.js').MediaType>>} */
  const entries = {
    'text/html': { type: 'text', subtype: 'html' },
    'application/ls+json': { type: 'application', subtype: 'ls', suffix: 'json' },
    'application/vnd.ms-excel': { type: 'application', tree: 'vnd', subtype: 'ms-excel' },
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
      type: 'application', tree: 'vnd.openxmlformats-officedocument.presentationml', subtype: 'presentation',
    },
    'application/vnd.api+json': {
      type: 'application', tree: 'vnd', subtype: 'api', suffix: 'json',
    },
    'application/vnd.api;charset=utf-8': {
      type: 'application', tree: 'vnd', subtype: 'api', parameters: { charset: 'utf-8' },
    },
    'application/vnd.api+json;charset=utf-8': {
      type: 'application', tree: 'vnd', subtype: 'api', suffix: 'json', parameters: { charset: 'utf-8' },
    },
    'multipart/mixed;boundary=gc0p4Jq0M2Yt08jU534c0p': {
      type: 'multipart', subtype: 'mixed', parameters: { boundary: 'gc0p4Jq0M2Yt08jU534c0p' },
    },
    'multipart/mixed;boundary="spaced quotation"': {
      type: 'multipart', subtype: 'mixed', parameters: { boundary: 'spaced quotation' },
    },
  };
  for (const [contentType, entry] of Object.entries(entries)) {
    const request = new HttpRequest({ headers: { 'content-type': contentType } });
    for (const property of ['type', 'suffix', 'subtype']) {
      if (property in entry) {
        t.is(request.mediaType[property], entry[property]);
      } else {
        t.falsy(request.mediaType[property]);
      }
    }
    t.deepEqual(entry.parameters ?? {}, request.mediaType.parameters);
  }
});

test('HttpRequest.mediaType - error', (t) => {
  /** @type {Record<string, Partial<import('../../../lib/HttpRequest.js').MediaType>>} */

  const request = new HttpRequest({ headers: { 'content-type': 'multipart/mixed;boundary=improper"quotes' } });
  const error = t.throws(() => request.mediaType);
  t.is(error.message, 'ERR_CONTENT_TYPE');
});

test('HttpRequest.charset', (t) => {
  /** @type {Record<string, string>} */
  const entries = {
    'text/html': null,
    'application/ls+json': null,
    'application/vnd.ms-excel': null,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': null,
    'application/vnd.api+json': null,
    'application/vnd.api;charset=utf-8': 'utf-8',
    'application/vnd.api+json;charset=utf-8': 'utf-8',
    'multipart/mixed;boundary=gc0p4Jq0M2Yt08jU534c0p': null,
    'multipart/mixed;boundary=gc0p4Jq0M2Yt08jU534c0p;charset=ascii': 'ascii',
  };
  for (const [contentType, charset] of Object.entries(entries)) {
    const request = new HttpRequest({ headers: { 'content-type': contentType } });
    if (charset) {
      t.is(request.charset, charset);
    } else {
      t.falsy(request.charset);
    }
  }
});

test('HttpRequest.bufferEncoding', (t) => {
  /** @type {Record<string, BufferEncoding>} */
  const entries = {
    'application/json': 'latin1',
    'application/json;charset=ascii': 'latin1',
    'application/json;charset=utf-8': 'utf-8',
    'application/json;charset=ucs-2': 'utf16le',
    'application/json;charset=utf8': 'utf-8',
    'application/json;charset=hex': 'hex',
    'application/json;charset=base64': 'base64',
  };
  for (const [contentType, bufferEncoding] of Object.entries(entries)) {
    const request = new HttpRequest({ headers: { 'content-type': contentType } });
    t.is(request.bufferEncoding, bufferEncoding);
  }
});

// @ts-check

/* eslint-disable no-console */

import { existsSync, readFileSync } from 'node:fs';

import HttpListener from '../helpers/HttpListener.js';
import RequestHeaders from '../helpers/RequestHeaders.js';
import ResponseHeaders from '../helpers/ResponseHeaders.js';
import HttpHandler from '../lib/HttpHandler.js';
import AutoHeadersMiddleware from '../middleware/AutoHeadersMiddleware.js';
import CORSMiddleware from '../middleware/CORSMiddleware.js';
import ContentDecoderMiddleware from '../middleware/ContentDecoderMiddleware.js';
import ContentEncoderMiddleware from '../middleware/ContentEncoderMiddleware.js';
import ContentLengthMiddleware from '../middleware/ContentLengthMiddleware.js';
import HashMiddleware from '../middleware/HashMiddleware.js';
import HeadMethodMiddleware from '../middleware/HeadMethodMiddleware.js';
import MethodMiddleware from '../middleware/MethodMiddleware.js';
import PathMiddleware from '../middleware/PathMiddleware.js';
import SendJsonMiddleware from '../middleware/SendJsonMiddleware.js';
import SendStringMiddleware from '../middleware/SendStringMiddleware.js';

import {
  HTTPS_HOST, HTTPS_PORT, HTTP_HOST, HTTP_PORT,
} from './constants.js';
import * as tls from './tls.js';
import { ServerResponse } from 'node:http';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */

/**
 * Redirect to HTTPS/2
 * @type {MiddlewareFunction}
 */
function redirectHttpsMiddleware({request,response}) {
  if (request.protocol === 'https:') {
    return true;
  }
  const url = new URL(request.url);
  url.protocol = 'https:';
  url.port = HTTPS_PORT.toString(10);
  const Location = url.href;
  response.headers.location = Location;
  return 301;
}

/** @type {MiddlewareFunction} */
function indexMiddleware(transaction) {
  console.log('indexMiddleware');
  transaction.response.headers['content-type'] = 'text/html';
  if (transaction.canPushPath) {
    transaction.pushPath('/script.js').catch(console.error);
    transaction.pushPath('/fake.png').catch(console.error);
  }
  return /* html */ `
    <html>
      <head><script src="script.js"></script></head>
      </body>
        ${new Date()}
        <img src="fake.png"/>
        <form action="form" method="POST"><input name="field"><input type="submit" value="POST"></form>
        <form action="form" method="GET"><input name="field"><input type="submit" value="GET"></form>
        <ul>
          <li><a href="/cors.html">/cors.html</a></li>
          <li><a href="/large.html">/large.html</a></li>
          <li><a href="/chunk.html">/chunk.html</a></li>
          <li><a href="/blank.html">/blank.html</a></li>
          <li><a href="/nocontent.html">/nocontent.html</a></li>
          <li><a href="/gzip.html">/gzip.html</a></li>
          <li><a href="/plaintext.html">/plaintext.html</a></li>
          <li><a href="/get.json">/get.json</a></li>
        </ul>
      </body>
    </html>
  `;
}

/** @type {MiddlewareFunction} */
function largeMiddleware({request}) {
  console.log('largeMiddleware');
  request.headers['content-type'] = 'text/html';
  let block = '';
  const len = Number.parseInt(request.searchParams.get('lines'), 10) || 10_000;
  for (let i = 0; i < len; i += 1) {
    block += `<pre>${i.toString(36)}</pre><br>`;
  }
  return /* html */ `
    <html>
      <head></head>
      </body>
        ${block}
      </body>
    </html>
  `;
}

/** @type {MiddlewareFunction} */
function chunkMiddleware({ request, response }) {
  console.log('chunkMiddleware');
  response.headers['content-type'] = 'text/html';
  let block = '';
  for (let i = 0; i < 1000; i += 1) {
    block += `<pre>${Math.random().toString(36).slice(2, 18)}</pre><br>`;
  }
  const delay = Number.parseInt(request.searchParams.get('delay'), 10) || 0;
  let stream = response.getPipeline();
  return new Promise((resolve) => {
    const timingFn = delay ? setTimeout : process.nextTick;
    timingFn(() => {
      console.log('write1');
      stream.write(/* html */ `
        <html>
            <head></head>
            </body>
      `);
    }, delay);
    timingFn(() => {
      console.log('write2');
      stream.write(block);
    }, delay * 2);
    timingFn(() => {
      console.log('write3');
      stream.write(/* html */ `
        </body>
        </html>
      `);
    }, delay * 3);
    timingFn(() => { 
      stream.end();
      resolve(HttpHandler.END);
     }, delay * 4);
  });
}

/** @type {MiddlewareFunction} */
function plainTextMiddleware({ response }) {
  console.log('plainTextMiddleware');
  response.status = 200;
  response.headers['content-type'] = 'text/html';
  response.headers['content-encoding'] = 'identity';
  return 'This is always in plaintext';
}

/** @type {MiddlewareFunction} */
function blankMiddleware({ response }) {
  console.log('blankMiddleware');
  response.headers['content-type'] = 'text/html';
  response.headers['content-length'] = '0';
  return 200;
}

/** @type {MiddlewareFunction} */
function gzipMiddleware({ response }) {
  console.log('gzipMiddleware');
  response.statusCode = 200;
  response.headers['content-type'] = 'text/html';
  response.headers['content-encoding'] = 'gzip';
  return 'This is always compressed with gzip.';
}

/** @type {MiddlewareFunction} */
function corsTest({ response }) {
  console.log('cors');
  response.statusCode = 200;
  response.headers['content-type'] = 'text/html';
  return /* html */ `
    <html>
      <head>
        <script type="text/javascript">
          fetch('http://127.0.0.1:8080/input.json', {
            headers: [['Content-Type', '']],
            method: 'POST', body: JSON.stringify({test: 'content'}),
            })
            .then((response) => response.json())
            .then(console.log)
            .catch(console.error);
        </script>
      </head>
      </body>
        <h1>CORS TEST</h1>
        ${new Date()}
      </body>
    </html>
  `;
}

/** @type {MiddlewareFunction} */
function scriptMiddleware(transaction) {
  const response = transaction.response;
  console.log('scriptMiddleware');
  console.log('Holding script');
  return new Promise((resolve) => {
    setTimeout(() => {
      response.statusCode = 200;
      response.headers['content-type'] = 'text/javascript';
      if (transaction.canPushPath) {
        transaction.pushPath('/fake.js').catch(console.error);
      } else {
        console.log('RIP Push');
      }
      console.log('Releasing script');
      response.end(/* js */ `
        console.log('hello');
        let data = '';
        for(let i = 0; i < 10 ; i++) {
          data += Math.random().toString(36).slice(2, 18);
        }
        console.log(data);
        fetch('http://127.0.0.1:8080/echo.json', {
          method: 'POST',
          body: JSON.stringify({data}),
          headers: [['Content-Type', 'application/json']],
        }).then((response) => response.json())
          .then((response) => console.log('match', response.data === data))
          .catch(console.error);
      `);
      resolve(HttpHandler.END);
    }, 0);
  });
}

ServerResponse

/** @type {MiddlewareFunction} */
function outputMiddleware({ request, response }) {
  const reqHeaders = new RequestHeaders(request);
  console.log(request.headers.cookie);
  console.log('reqHeaders.cookieEntries.test', reqHeaders.cookieEntries.test);
  console.log('req.headers.cookie', request.headers.cookie);
  console.log('reqHeaders.cookies.get("test")', reqHeaders.cookies.get('test'));
  console.log('reqHeaders.cookies.all("test")', reqHeaders.cookies.all('test'));
  console.log('reqHeaders.cookieEntries.test?.[0]', reqHeaders.cookieEntries.test?.[0]);
  console.log('reqHeaders.cookieEntries.test?.[1]', reqHeaders.cookieEntries.test?.[1]);
  console.log('reqHeaders.cookieEntries.test2?.[0]', reqHeaders.cookieEntries.test2?.[0]);
  console.log('reqHeaders.cookieEntries.test4', reqHeaders.cookieEntries.test4);
  console.log("'test' in reqHeaders.cookieEntries", 'test' in reqHeaders.cookieEntries);
  console.log("'test4' in reqHeaders.cookieEntries", 'test4' in reqHeaders.cookieEntries);
  console.log('req.headers.cookie', request.headers.cookie);

  const resHeaders = new ResponseHeaders(response);
  resHeaders.cookies.set({
    name: 'test',
    value: Date.now().toString(),
  });
  resHeaders.cookies.set({ name: 'test2', value: Date.now().toString() });
  resHeaders.cookies.set(`test3=${Date.now()}`);
  resHeaders.cookies.set('test=newtest;Path=/test/*');
  const testCookieObject = resHeaders.cookies.get('test');
  testCookieObject.value = 'replaced';
  resHeaders.cookies.expire('test4');
  console.log('all', JSON.stringify(resHeaders.cookies.findAll(), null, 2));
  resHeaders.cookies.expireAll('test');
  resHeaders.cookieEntries.forEach((c) => console.log(c.toString()));
  console.log('wiping');
  resHeaders.cookieEntries.splice(0, resHeaders.cookieEntries.length);
  resHeaders.cookieEntries.forEach((c) => console.log(c.toString()));
  console.log('pushing 1 ');
  const held = resHeaders.cookies.set(`held=${Date.now()}`);
  resHeaders.cookies.remove(held);
  resHeaders.cookieEntries.forEach((c) => console.log(c.toString()));
  console.log('modifying held');
  held.secure = true;
  // console.log('unshifting 1 ');
  // resHeaders.cookieEntries.unshift(new CookieObject(`unshift=${Date.now()}`));
  resHeaders.cookieEntries.forEach((c) => console.log(c.toString()));
  console.log('putting back');
  resHeaders.cookieEntries.unshift(held);
  resHeaders.cookieEntries.forEach((c) => console.log(c.toString()));
  resHeaders.cookies.set('novalue=');
  resHeaders.cookies.set('noname');
  resHeaders.cookies.set('=blankname;path=/');
  resHeaders.cookies.set('quotedblank=""');
  resHeaders.cookieEntries.forEach((c) => console.log(c.toString()));
  // res.statusCode = 200;
  // resHeaders.mediaType = 'application/json';
  return { now: new Date() };
}

/** @type {MiddlewareFunction} */
async function inputMiddleware({ request, response }) {
  console.log('inputMiddleware');

  console.log('stalled processing for 1000ms');
  // await new Promise((resolve) => setTimeout(resolve, 1000));
  response.statusCode = 200;
  console.log('reading post data from input.json');
  // Pipe it back and read at the same time
  request.stream.pipe(response.getPipeline());
  // res.pipeFrom(req.stream);
  const value = await request.read();
  console.log('got input.json', typeof value, value);
  return HttpHandler.END;
}

/** @type {MiddlewareFunction} */
async function echoMiddleware({ request, response }) {
  console.log('echoMiddleware');
  return request.stream;
}

/** @type {MiddlewareFunction} */
async function formGetMiddleware({ request, response }) {
  console.log('formGetMiddleware');

  console.log('stalled processing for 1000ms');
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const data = Object.fromEntries(request.searchParams.entries());
  console.log('returning', data);
  return response.send(data);
}

/** @type {MiddlewareFunction} */
function outputURLMiddleware({ request, response, state }) {
  console.log('outputURLMiddleware', state.path);
  return response.code(200).end(request.pathname);
}

/** @type {MiddlewareFunction} */
async function formPostMiddleware({ request, response }) {
  console.log('formPostMiddleware');
  /** @type {FormData} */
  const value = await request.read();
  const stringData = JSON.stringify(value);
  return `type: ${request.headers['content-type']}\n${stringData.toString()}`;
}

/** @type {MiddlewareFunction} */
function getJSONMiddleware() {
  console.log('getJSONMiddleware');
  return { now: new Date() };
}

const USE_HTTPS_REDIRECT = false;
const SHOULD_CRASH = false;

/**
 *
 */
function setupHandler() {
  const { middleware, errorHandlers } = HttpHandler.defaultInstance;
  // Conditional statement
  middleware.push(USE_HTTPS_REDIRECT ? redirectHttpsMiddleware : null);
  const middlewareObject = new Set([
    // Allow Cross-Origin Resource Sharing
    new CORSMiddleware({ allowOrigin: ['http://localhost:8080', 'https://localhost:8443'] }),

    new ContentDecoderMiddleware(), // Automatically decodes content

    new SendJsonMiddleware({
      defaultCharset: 'utf-8',
      setCharset: true,
      setMediaType: true,
    }), // Auto converts objects to JSON
    new SendStringMiddleware({
      defaultCharset: 'utf-8',
      setCharset: true,
    }), // Auto converts strings to buffer
    new ContentEncoderMiddleware(), // Compress anything after
    new HashMiddleware(), // Hash anything after
    new ContentLengthMiddleware(), // Calculate length of anything after
    new AutoHeadersMiddleware(), // Send headers automatically
    new HeadMethodMiddleware(), // Discard body content

  ]);
  middleware.push(middlewareObject);
  const setTest = new Set();
  middleware.push(setTest);
  /** @type {any} */
  const getMiddlewareArray = [
    MethodMiddleware.GET,
    [new PathMiddleware(/^\/(index.html?)?$/), indexMiddleware],
    [new PathMiddleware('/large.html'), largeMiddleware],
    [new PathMiddleware('/chunk.html'), chunkMiddleware],
    [new PathMiddleware('/blank.html'), blankMiddleware],
    [new PathMiddleware('/nocontent.html'), 204],
    [new PathMiddleware('/gzip.html'), gzipMiddleware],
    [new PathMiddleware('/plaintext.html'), plainTextMiddleware],
    [new PathMiddleware('/get.json'), getJSONMiddleware],
    [new PathMiddleware('/form'), formGetMiddleware],
  ];
  setTest.add(getMiddlewareArray);
  // Modify after insertion
  getMiddlewareArray.push(
    [new PathMiddleware({ path: '/script.js' }), scriptMiddleware],
  );
  // Add terminator middleware
  getMiddlewareArray.push(
    [new PathMiddleware({ path: /\/output.json$/ }), outputMiddleware],
  );

  // Predefined Route
  const route = [
    [new PathMiddleware('/'), outputURLMiddleware],
    [new PathMiddleware('/foo'), outputURLMiddleware],
    [new PathMiddleware('/bar'), outputURLMiddleware],
    [new PathMiddleware('/baz'), outputURLMiddleware],
  ];

  // Automatic Path Routing
  middleware.push([
    MethodMiddleware.GET,
    [new PathMiddleware({ path: /^(\/subpath)\/?.*/, subPath: true }), [
      [new PathMiddleware('/'), outputURLMiddleware],
      [new PathMiddleware('/foo'), outputURLMiddleware],
      [new PathMiddleware('/bar'), outputURLMiddleware],
    ]],
    [PathMiddleware.SUBPATH('/subpath2'), [
      [new PathMiddleware('/'), outputURLMiddleware],
      [new PathMiddleware('/foo'), outputURLMiddleware],
      [new PathMiddleware('/baz'), outputURLMiddleware],
    ]],
    [PathMiddleware.SUBPATH('/subpath3'), route],
    [PathMiddleware.SUBPATH('/foo'), [
      [new PathMiddleware('/'), outputURLMiddleware],
      [PathMiddleware.SUBPATH('/bar'), [
        [new PathMiddleware('/'), outputURLMiddleware],
        [PathMiddleware.SUBPATH('/baz'), route],
      ]],
    ]],
  ]);

  // Add error handler
  middleware.push([MethodMiddleware.GET,
    new PathMiddleware('/error'),
    function throwError() {
      throw new Error('unexpected error!');
    }]);
  middleware.push([
    MethodMiddleware.GET,
    new PathMiddleware('/catch'),
    function throwError() {
      throw new Error('EXCEPTION!');
    },
    {
      onError: ({ error }) => {
        console.log('I catch and rethrow errors.');
        throw error;
      },
    },
    {
      onError: ({ error }) => {
        console.warn('Caught exception. Allowing continue.', error);
        return HttpHandler.CONTINUE;
      },
    },
    'Error was caught.'
  ]);

  // Inline middleware and filter adding
  middleware.push(
    [
      MethodMiddleware.POST,
      [new PathMiddleware('/input.json'), inputMiddleware],
      [new PathMiddleware('/echo.json'), echoMiddleware],
      [new PathMiddleware('/form'), formPostMiddleware],
    ],
    [
      () => SHOULD_CRASH,
      () => { throw new Error('Break not called!'); },
    ],
    [
      MethodMiddleware.GET,
      new PathMiddleware('/cors.html'),
      corsTest,
      HttpHandler.END,
    ],
    ({ request }) => {
      console.log('Unknown', request.url);
      return 404;
    },
  );

  errorHandlers.push({
    onError({ error }) {
      console.error('Uncaught exception');
      console.error(error);
      return 500;
    },
  });
  console.dir([
    middleware,
    errorHandlers,
  ], { colors: true, depth: null });
}

const listener = new HttpListener({
  insecureHost: HTTP_HOST,
  insecurePort: HTTP_PORT,
  secureHost: HTTPS_HOST,
  securePort: HTTPS_PORT,
  tlsOptions: tls.setup({
    key: existsSync('./certificates/localhost-privkey.pem') && readFileSync('./certificates/localhost-privkey.pem'),
    cert: existsSync('./certificates/localhost-privkey.pem') && readFileSync('./certificates/localhost-cert.pem'),
  }),
});

setupHandler();
listener.startAll().then(() => console.log('Ready.'));

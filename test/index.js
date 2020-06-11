/* eslint-disable no-console */

import { readFileSync, existsSync } from 'fs';
import * as httpserver from './httpserver.js';
import * as http2server from './http2server.js';
import * as tls from './tls.js';
import { HTTPS_PORT } from './constants.js';

import {
  handleHttp1Request,
  handleHttp2Stream,
  DefaultMiddlewareChain,
  MiddlewareSets,
  AllMiddleware,
  DefaultMiddlewareErrorHandlers,
} from '../lib/RequestHandler.js';
import { defaultSendHeadersMiddleware } from '../middleware/sendHeaders.js';
import { defaultContentLengthMiddleware } from '../middleware/contentLength.js';
import { defaultHashMiddleware } from '../middleware/hash.js';
import { defaultContentEncoderMiddleware } from '../middleware/contentEncoder.js';
import { createMethodFilter } from '../middleware/methodFilter.js';
import { createPathFilter, createPathRegexFilter } from '../middleware/pathFilter.js';
import { createCORSMiddleware } from '../middleware/cors.js';
import RequestHeaders from '../helpers/RequestHeaders.js';
import ResponseHeaders from '../helpers/ResponseHeaders.js';
import { createContentWriterMiddleware } from '../middleware/contentWriter.js';
import { createContentReaderMiddleware } from '../middleware/contentReader.js';
import { readStreamChunk } from '../utils/stream.js';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */

/**
 * Redirect to HTTPS/2
 * @type {MiddlewareFunction}
 */
function redirectHttpsMiddleware({ req, res }) {
  if (req.url.protocol !== 'http:') {
    return null;
  }
  const url = new URL(req.url.href);
  url.protocol = 'https:';
  url.port = HTTPS_PORT.toString(10);
  const Location = url.href;
  res.status = 301;
  res.headers.location = Location;
  res.sendHeaders();
  return 'end';
}

/** @type {MiddlewareFunction} */
function indexMiddleware({ res }) {
  console.log('indexMiddleware');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  if (res.canPushPath) {
    res.pushPath('/script.js').catch(console.error);
    res.pushPath('/fake.png').catch(console.error);
  }
  res.stream.end(/* html */ `
    <html>
      <head><script src="script.js"></script></head>
      </body>
        ${new Date()}
        <img src="fake.png"/>
        <form action="form" method="POST"><input name="field"><input type="submit" value="POST"></form>
        <form action="form" method="GET"><input name="field"><input type="submit" value="GET"></form>
      </body>
    </html>
  `);
  return 'end';
}

/** @type {MiddlewareFunction} */
function largeMiddleware({ req, res }) {
  console.log('largeMiddleware');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  let block = '';
  const len = Number.parseInt(req.url.searchParams.get('lines'), 10) || 10000;
  for (let i = 0; i < len; i += 1) {
    block += `<pre>${i.toString(36)}</pre><br>`;
  }
  res.stream.end(/* html */ `
    <html>
      <head></head>
      </body>
        ${block}
      </body>
    </html>
  `);
  return 'end';
}

/** @type {MiddlewareFunction} */
function chunkMiddleware({ req, res }) {
  console.log('chunkMiddleware');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  let block = '';
  for (let i = 0; i < 1000; i += 1) {
    block += `<pre>${Math.random().toString(36).substr(2, 16)}</pre><br>`;
  }
  const delay = Number.parseInt(req.url.searchParams.get('delay'), 10) || 0;
  return new Promise((resolve) => {
    const timingFn = delay ? setTimeout : process.nextTick;
    timingFn(() => {
      console.log('write1');
      res.stream.write(/* html */ `
    <html>
        <head></head>
        </body>
    `);
    }, delay);
    timingFn(() => {
      console.log('write2');
      res.stream.write(block);
    }, delay * 2);
    timingFn(() => {
      console.log('write3');
      res.stream.write(/* html */ `
        </body>
      </html>
    `);
    }, delay * 3);
    timingFn(() => { resolve('end'); }, delay * 4);
  });
}

/** @type {MiddlewareFunction} */
function plainTextMiddleware({ res }) {
  console.log('plainTextMiddleware');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  res.headers['content-encoding'] = 'identity';
  res.stream.end('This is always in plaintext');
  return 'end';
}

/** @type {MiddlewareFunction} */
function blankMiddleware({ res }) {
  console.log('blankMiddlware');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  return 'end';
}

/** @type {MiddlewareFunction} */
function noContentMiddleware({ res }) {
  console.log('noContentMiddleware');
  res.status = 204;
  return 'end';
}

/** @type {MiddlewareFunction} */
function gzipMiddleware({ res }) {
  console.log('gzipMiddlware');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  res.headers['content-encoding'] = 'gzip';
  res.stream.end('This is always compressed with gzip.');
  return 'end';
}

/** @type {MiddlewareFunction} */
function corsTest({ res }) {
  console.log('cors');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  res.stream.end(/* html */ `
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
  `);
  return 'end';
}

/** @type {MiddlewareFunction} */
function scriptMiddleware({ res }) {
  console.log('scriptMiddleware');
  console.log('Holding script');
  return new Promise((resolve) => {
    setTimeout(() => {
      res.status = 200;
      res.headers['content-type'] = 'text/javascript';
      if (res.canPushPath) {
        res.pushPath('/fake.js').catch(console.error);
      } else {
        console.log('RIP Push');
      }
      console.log('Releasing script');
      res.stream.end(/* js */ `
        console.log('hello');
        let data = '';
        for(let i = 0; i < 10000 ; i++) {
          data += Math.random().toString(36).substr(2, 16);
        }
        console.log(data);
        fetch('http://127.0.0.1:8080/input.json', {
          method: 'POST',
          body: JSON.stringify({data}),
          headers: [['Content-Type', 'application/json']],
        }).then((response) => response.json())
          .then((response) => console.log('match', response.data === data))
          .catch(console.error);
      `);
      resolve('end');
    }, 0);
  });
}

/** @type {MiddlewareFunction} */
function outputMiddleware({ req, res }) {
  const reqHeaders = new RequestHeaders(req);
  console.log(req.headers.cookie);
  console.log('reqHeaders.cookieEntries.test', reqHeaders.cookieEntries.test);
  console.log('req.headers.cookie', req.headers.cookie);
  console.log('reqHeaders.cookies.get("test")', reqHeaders.cookies.get('test'));
  console.log('reqHeaders.cookies.all("test")', reqHeaders.cookies.all('test'));
  console.log('reqHeaders.cookieEntries.test?.[0]', reqHeaders.cookieEntries.test?.[0]);
  console.log('reqHeaders.cookieEntries.test?.[1]', reqHeaders.cookieEntries.test?.[1]);
  console.log('reqHeaders.cookieEntries.test2?.[0]', reqHeaders.cookieEntries.test2?.[0]);
  console.log('reqHeaders.cookieEntries.test4', reqHeaders.cookieEntries.test4);
  console.log("'test' in reqHeaders.cookieEntries", 'test' in reqHeaders.cookieEntries);
  console.log("'test4' in reqHeaders.cookieEntries", 'test4' in reqHeaders.cookieEntries);
  console.log('req.headers.cookie', req.headers.cookie);

  const resHeaders = new ResponseHeaders(res);
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
  res.status = 200;
  // resHeaders.mediaType = 'application/json';
  res.stream.end({ now: new Date() });
}

/** @type {MiddlewareFunction} */
async function inputMiddleware({ req, res }) {
  console.log('inputMiddleware');

  return new Promise((resolve) => {
    console.log('stalled processing for 1000ms');
    setTimeout(async () => {
      res.status = 200;
      // Pipe it back and read at the same time
      // req.stream.pipe(res.stream);
      const { value } = await req.stream[Symbol.asyncIterator]().next();
      console.log('got input.json', typeof value, value);
      // res.stream.end(value);
      resolve('end');
    }, 0);
  });
}

/** @type {MiddlewareFunction} */
async function formGetMiddleware({ req, res }) {
  console.log('formGetMiddleware');

  return new Promise((resolve) => {
    console.log('stalled processing for 1000ms');
    setTimeout(async () => {
      const values = Object.fromEntries(req.url.searchParams.entries());
      res.status = 200;
      res.stream.end(values);
      resolve('end');
    }, 1000);
  });
}

/** @type {MiddlewareFunction} */
async function formPostMiddleware({ req, res }) {
  console.log('formPostMiddleware');

  return new Promise((resolve) => {
    console.log('stalled processing for 1000ms');
    setTimeout(async () => {
      const value = await readStreamChunk(req.stream);
      res.status = 200;
      res.stream.end(value);
      resolve('end');
    }, 1000);
  });
}

/** @type {MiddlewareFunction} */
function getJSONMiddleware({ res }) {
  console.log('getJSONMiddleware');
  res.status = 200;
  res.stream.end({ now: new Date() });
  return 'end';
}

const USE_HTTPS_REDIRECT = false;
const SHOULD_CRASH = false;

function handleAllMiddleware() {
  // Conditional statement
  DefaultMiddlewareChain.push(USE_HTTPS_REDIRECT ? redirectHttpsMiddleware : null);
  const middlewareObject = {
    // Send headers automatically
    sendHeaders: defaultSendHeadersMiddleware,
    // Calculate length of anything after
    contentLength: defaultContentLengthMiddleware,
    // Allow Cross-Origin Resource Sharing
    cors: createCORSMiddleware({
      allowOrigin: ['http://localhost:8080'],
    }),
    // Hash anything after
    hash: defaultHashMiddleware,
    // Compress anything after
    contentEncoder: defaultContentEncoderMiddleware,
    // Convert Objects and Strings to Buffer
    contentWriter: createContentWriterMiddleware({
      setCharset: true,
      setJSON: true,
    }),
    // Automatically reads text, JSON, and form-url-encoded from requests
    contentReader: createContentReaderMiddleware({
      buildString: true,
      defaultMediaType: 'application/json',
      parseJSON: true,
      formURLEncodedFormat: 'object',
    }),
  };
  DefaultMiddlewareChain.push(middlewareObject);
  const mapTest = new Map();
  MiddlewareSets.add(mapTest);
  /** @type {any} */
  const getMiddlewareArray = [
    createMethodFilter('GET'),
    [createPathRegexFilter('^/(index.html?)?$'), indexMiddleware],
    [createPathFilter('/large.html'), largeMiddleware],
    [createPathFilter('/chunk.html'), chunkMiddleware],
    [createPathFilter('/blank.html'), blankMiddleware],
    [createPathFilter('/nocontent.html'), noContentMiddleware],
    [createPathFilter('/gzip.html'), gzipMiddleware],
    [createPathFilter('/plaintext.html'), plainTextMiddleware],
    [createPathFilter('/get.json'), getJSONMiddleware],
    [createPathFilter('/form'), formGetMiddleware],
  ];
  mapTest.set('gets', getMiddlewareArray);
  // Modify after insertion
  getMiddlewareArray.push(
    [createPathFilter('/script.js'), scriptMiddleware],
  );
  // Add terminator middleware
  getMiddlewareArray.push(
    [createPathRegexFilter('/output.json$'), outputMiddleware, 'end'],
  );

  // Add error handler
  MiddlewareSets.add([createMethodFilter('GET'),
    createPathFilter('/error'),
    function throwError() {
      throw new Error('unexpected error!');
    }]);
  MiddlewareSets.add([
    createMethodFilter('GET'),
    createPathFilter('/catch'),
    function throwError() {
      throw new Error('EXCEPTION!');
    },
    {
      onError: ({ err }) => {
        console.log('I catch and rethrow errors.');
        throw new Error(err);
      },
    },
    {
      onError: ({ err }) => {
        console.warn('Caught exception. Allowing continue.', err);
        return Promise.resolve('continue');
      },
    },
    function responseAfterError({ res }) {
      res.status = 200;
      res.stream.write('Error was caught.');
      return 'end';
    },

  ]);

  // Inline middleware and filter adding
  MiddlewareSets.add({
    myPostMiddlewares: [
      createMethodFilter('POST'),
      [createPathFilter('/input.json'), inputMiddleware],
      [createPathFilter('/form'), formPostMiddleware],
    ],
    inlineFilter: [
      () => SHOULD_CRASH,
      () => { throw new Error('Break not called!'); },
    ],
    corsTest: [
      createMethodFilter('GET'),
      createPathFilter('/cors.html'),
      corsTest,
      'end',
    ],
    unknownFile({ req, res }) {
      console.log('Unknown', req.url.toString());
      res.status = 404;
      return 'end';
    },
  });

  DefaultMiddlewareErrorHandlers.push({
    onError({ res, err }) {
      console.error('Uncaught exception');
      console.error(err);
      res.status = 500;
    },
  });
  console.dir(AllMiddleware, { colors: true, depth: null });
}


function setupHttp() {
  return httpserver.start().then((server) => {
    console.log('HTTP listening...', server.address());
    server.addListener('request', handleHttp1Request);
  });
}

function setupHttp2() {
  const tlsOptions = tls.setup({
    key: existsSync('./certificates/localhost-privkey.pem') && readFileSync('./certificates/localhost-privkey.pem'),
    cert: existsSync('./certificates/localhost-privkey.pem') && readFileSync('./certificates/localhost-cert.pem'),
  });

  return http2server.start({
    allowHTTP1: true,
    SNICallback: tls.SNICallback,

    ...tlsOptions,
  }).then((server) => {
    console.log('HTTPS/2 listening...', server.address());
    server.addListener('stream', handleHttp2Stream);
    server.addListener('request', (req, res) => {
      if (req.httpVersionMajor >= 2) return;
      // @ts-ignore
      handleHttp1Request(req, res);
    });
  });
}

handleAllMiddleware();
Promise.all([setupHttp(), setupHttp2()]).then(() => console.log('Ready.'));

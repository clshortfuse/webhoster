/* eslint-disable no-console */

import * as httpserver from './httpserver.js';
import * as http2server from './http2server.js';
import * as tls from './tls.js';
import { HTTPS_PORT } from './constants.js';

import {
  handleHttpRequest,
  handleHttp2Stream,
  DefaultMiddlewareChain,
  MiddlewareSets,
  AllMiddleware,
  DefaultMiddlewareErrorHandlers,
} from '../lib/RequestHandler.js';
import ResponseWriter from '../helpers/ResponseWriter.js';
import RequestReader from '../helpers/RequestReader.js';
import { defaultCompressionMiddleware } from '../middleware/compression.js';
import { createMethodFilter } from '../middleware/method.js';
import { createPathFilter, createPathRegexFilter } from '../middleware/path.js';
import { createCORSMiddleware } from '../middleware/cors.js';
import RequestHeaders from '../helpers/RequestHeaders.js';
import ResponseHeaders from '../helpers/ResponseHeaders.js';

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
  res.headers.Location = Location;
  return 'end';
}

/** @type {MiddlewareFunction} */
function indexMiddleware({ res }) {
  const writer = new ResponseWriter(res);
  console.log('indexMiddleware');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  if (res.canPushPath) {
    res.pushPath('/script.js').catch(console.error);
    res.pushPath('/fake.png').catch(console.error);
  }
  writer.sendString(/* html */ `
    <html>
      <head><script src="script.js"></script></head>
      </body>
        ${new Date()}
        <img src="fake.png"/>
      </body>
    </html>
  `);
  return 'end';
}

/** @type {MiddlewareFunction} */
function corsTest({ res }) {
  const writer = new ResponseWriter(res);
  console.log('cors');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  writer.sendString(/* html */ `
    <html>
      <head>
        <script type="text/javascript">
          fetch('http://127.0.0.1:8080/input.json', {
            headers: [
              ['Content-Type', 'application/json'],
            ],
            method: 'POST', body: JSON.stringify({test: 'content'}),
            })
            .then(console.log('done')).catch(console.error);
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
  const writer = new ResponseWriter(res);
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
      writer.send(/* js */ `
        console.log('hello');
        let data = '';
        for(let i = 0; i < 2000 ; i++) {
          data += Math.random().toString(36).substr(2, 16);
        }
        console.log(data);
        fetch('http://127.0.0.1:8080/input.json', { method: 'POST', body: JSON.stringify(data) })
          .then(console.log('done')).catch(console.error);
      `);
      resolve('end');
    }, 0);
  });
}

/** @type {MiddlewareFunction} */
function outputMiddleware({ req, res }) {
  const reqHeaders = new RequestHeaders(req);
  console.log(req.headers.Cookie);
  console.log('reqHeaders.cookieEntries.test', reqHeaders.cookieEntries.test);
  req.headers.Cookie = `${req.headers.Cookie || ''};test=injected`;
  console.log('injected', req.headers.Cookie);
  if (reqHeaders.cookieEntries.test) {
    reqHeaders.cookieEntries.test.push('hello');
  }
  console.log('req.headers.Cookie', req.headers.Cookie);
  req.headers.Cookie = '';
  console.log('destroyed', req.headers.Cookie);
  reqHeaders.cookies.all('test').push('hello');
  console.log('req.headers.Cookie', req.headers.Cookie);
  console.log('reqHeaders.cookies.get("test")', reqHeaders.cookies.get('test'));
  console.log('reqHeaders.cookies.all("test")', reqHeaders.cookies.all('test'));
  console.log('reqHeaders.cookieEntries.test?.[0]', reqHeaders.cookieEntries.test?.[0]);
  console.log('reqHeaders.cookieEntries.test?.[1]', reqHeaders.cookieEntries.test?.[1]);
  console.log('reqHeaders.cookieEntries.test2?.[0]', reqHeaders.cookieEntries.test2?.[0]);
  console.log('reqHeaders.cookieEntries.test4', reqHeaders.cookieEntries.test4);
  console.log("'test' in reqHeaders.cookieEntries", 'test' in reqHeaders.cookieEntries);
  console.log("'test4' in reqHeaders.cookieEntries", 'test4' in reqHeaders.cookieEntries);
  console.log('req.headers.Cookie', req.headers.Cookie);

  const resHeaders = new ResponseHeaders(res);
  const writer = new ResponseWriter(res);
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
  res.status = 200;
  resHeaders.mediaType = 'application/json';
  writer.send({ now: new Date() });
}

/** @type {MiddlewareFunction} */
function inputMiddleware({ req, res }) {
  console.log('inputMiddleware');
  const reader = new RequestReader(req);
  return reader.readBuffer().then((data) => {
    console.log(data.length);
    const writer = new ResponseWriter(res);
    res.status = 200;
    writer.send({ now: new Date() });
    return 'end';
  });
}

const USE_HTTPS_REDIRECT = false;
const SHOULD_CRASH = false;

function handleAllMiddleware() {
  // Conditional statement
  DefaultMiddlewareChain.push(USE_HTTPS_REDIRECT ? redirectHttpsMiddleware : null);
  const middlewareObject = {
    cors: createCORSMiddleware({ allowOrigin: ['http://localhost:8080'] }),
    compression: defaultCompressionMiddleware,
  };
  DefaultMiddlewareChain.push(middlewareObject);
  const mapTest = new Map();
  MiddlewareSets.add(mapTest);
  /** @type {any} */
  const getMiddlewareArray = [
    createMethodFilter('GET'),
    [createPathRegexFilter('^/(index.html?)?$'), indexMiddleware],
  ];
  mapTest.set('gets', getMiddlewareArray);
  // Modify after insertion
  getMiddlewareArray.push(
    [createPathFilter('^/script.js'), scriptMiddleware],
  );
  // Add terminator middleware
  getMiddlewareArray.push(
    [createPathRegexFilter('/output.json$'), outputMiddleware, 'end'],
  );

  // Add error handler
  MiddlewareSets.add([
    createMethodFilter('GET'),
    createPathFilter('/error'),
    function throwError() {
      throw new Error('EXCEPTION!');
    },
    {
      onError: ({ err }) => {
        throw new Error(err);
      },
    },
    { onError: () => console.log('Caught exception. Allowing continue') },
    function responseAfterError({ res }) {
      res.status = 200;
      res.payload.write('Error was caught.');
      return 'end';
    },

  ]);

  // Inline middleware and filter adding
  MiddlewareSets.add({
    myPostMiddlewares: [
      createMethodFilter('POST'),
      [createPathFilter('/input.json'), inputMiddleware],
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
    server.addListener('request', handleHttpRequest);
  });
}

function setupHttp2() {
  const tlsOptions = tls.setup({
    // key: readFileSync('./certificates/localhost-privkey.pem'),
    // cert: readFileSync('./certificates/localhost-cert.pem'),
  });

  return http2server.start({
    allowHTTP1: true,
    SNICallback: tls.SNICallback,

    ...tlsOptions,
  }).then((server) => {
    console.log('HTTPS listening...', server.address());
    server.addListener('stream', handleHttp2Stream);
    server.addListener('request', (req, res) => {
      if (req.httpVersionMajor >= 2) return;
      handleHttpRequest(req, res);
    });
  });
}

handleAllMiddleware();
Promise.all([setupHttp(), setupHttp2()]).then(() => console.log('Ready.'));

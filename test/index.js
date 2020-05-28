import * as httpserver from './httpserver.js';
import * as http2server from './http2server.js';
import * as tls from './tls.js';
import { HTTPS_PORT } from './constants.js';

import {
  handleHttpRequest, handleHttp2Stream, DefaultMiddlewareSet,
} from '../lib/RequestHandler.js';
import ResponseWriter from '../helpers/ResponseWriter.js';
import HeadersHandler from '../helpers/HeadersHandler.js';
import RequestReader from '../helpers/RequestReader.js';
import { defaultCompressionMiddleware } from '../middleware/compression.js';
import { createRegexMiddleware } from '../middleware/regex.js';
import CookieObject from '../helpers/CookieObject.js';

/** @typedef {import('../lib/HttpRequest.js').default} HttpRequest */
/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */

/**
 * Redirect to HTTPS/2
 * @param {HttpRequest} req
 * @param {HttpResponse} res
 * @return {Promise<boolean>}
 */
function redirectHttpsMiddleware(req, res) {
  if (req.url.protocol !== 'http:') {
    return Promise.resolve(false);
  }
  const url = new URL(req.url.href);
  url.protocol = 'https:';
  url.port = HTTPS_PORT.toString(10);
  const Location = url.href;
  res.status = 301;
  res.headers.Location = Location;
  return Promise.resolve(true);
}

/**
 * @param {HttpRequest} req
 * @param {HttpResponse} res
 * @return {Promise<boolean>}
 */
function indexMiddleware(req, res) {
  const writer = new ResponseWriter(res);
  console.log('indexMiddleware');
  res.status = 200;
  res.headers['content-type'] = 'text/html';
  return Promise.resolve().then(() => {
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
  }).then(() => true);
}

/**
 * @param {HttpRequest} req
 * @param {HttpResponse} res
 * @return {Promise<boolean>}
 */
function scriptMiddleware(req, res) {
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
        fetch('input.json', { method: 'POST', body: JSON.stringify(data) })
          .then(console.log('done')).catch(console.error);
      `);
      resolve(true);
    }, 0);
  });
}

/**
 * @param {HttpRequest} req
 * @param {HttpResponse} res
 * @return {Promise<boolean>}
 */
function outputMiddleware(req, res) {
  const reqHeaders = new HeadersHandler(req.headers);
  console.log(req.headers.Cookie);
  console.log('reqHeaders.cookies.test', reqHeaders.cookies.test);
  req.headers.Cookie = `${req.headers.Cookie};test=injected`;
  console.log('injected', req.headers.Cookie);
  if (reqHeaders.cookies.test) {
    reqHeaders.cookies.test.push('hello');
  }
  console.log('req.headers.Cookie', req.headers.Cookie);
  req.headers.Cookie = '';
  console.log('destroyed', req.headers.Cookie);
  reqHeaders.cookies.test.push('hello');
  console.log('req.headers.Cookie', req.headers.Cookie);
  console.log('reqHeaders.cookies.test?.[0]', reqHeaders.cookies.test?.[0]);
  console.log('reqHeaders.cookies.test?.[1]', reqHeaders.cookies.test?.[1]);
  console.log('reqHeaders.cookies.test2?.[0]', reqHeaders.cookies.test2?.[0]);
  console.log('reqHeaders.cookies.test4', reqHeaders.cookies.test4);
  console.log("'test' in reqHeaders.cookies", 'test' in reqHeaders.cookies);
  console.log("'test4' in reqHeaders.cookies", 'test4' in reqHeaders.cookies);
  console.log('req.headers.Cookie', req.headers.Cookie);

  const resHeaders = new HeadersHandler(res.headers);
  const writer = new ResponseWriter(res);
  resHeaders.setCookies.push(new CookieObject({
    name: 'test',
    value: Date.now().toString(),
  }));
  resHeaders.setCookies.push(new CookieObject(`test2=${Date.now()}`));
  resHeaders.setCookies.push(new CookieObject(`test3=${Date.now()}`));
  resHeaders.setCookies.push(new CookieObject('test=newtest;Path=/test/*'));
  resHeaders.setCookies.forEach((c) => console.log(c.toString()));
  console.log('wiping');
  resHeaders.setCookies.splice(0, resHeaders.setCookies.length);
  resHeaders.setCookies.forEach((c) => console.log(c.toString()));
  console.log('pushing 1 ');
  const held = new CookieObject(`held=${Date.now()}`);
  resHeaders.setCookies.push(held);
  resHeaders.setCookies.forEach((c) => console.log(c.toString()));
  console.log('unshifting 1 ');
  resHeaders.setCookies.unshift(new CookieObject(`dolly=${Date.now()}`));
  resHeaders.setCookies.forEach((c) => console.log(c.toString()));
  console.log('modifying held');
  held.secure = true;
  resHeaders.setCookies.forEach((c) => console.log(c.toString()));
  res.status = 200;
  resHeaders.mediaType = 'application/json';
  writer.send({ now: new Date() });
  return Promise.resolve(true);
}

/**
 * @param {HttpRequest} req
 * @param {HttpResponse} res
 * @return {Promise<boolean>}
 */
function inputMiddleware(req, res) {
  console.log('inputMiddleware');
  const reader = new RequestReader(req);
  return reader.readBuffer().then((data) => {
    console.log(data.length);
    const writer = new ResponseWriter(res);
    res.status = 200;
    writer.send({ now: new Date() });
    return Promise.resolve(true);
  });
}

function handleAllMiddleware() {
  DefaultMiddlewareSet.add(defaultCompressionMiddleware);
  // DefaultMiddlewareSet.add(redirectHttpsMiddleware);
  DefaultMiddlewareSet.add(createRegexMiddleware(indexMiddleware, '^/(index.html?)?$', 'get'));
  DefaultMiddlewareSet.add(createRegexMiddleware(scriptMiddleware, '^/script.js$', 'get'));
  DefaultMiddlewareSet.add(createRegexMiddleware(outputMiddleware, '/output.json$', 'get'));
  DefaultMiddlewareSet.add(createRegexMiddleware(inputMiddleware, '/input.json$', 'post'));
  DefaultMiddlewareSet.add(((req, res) => {
    console.log('Unknown', req.url.toString());
    res.status = 404;
    return Promise.resolve(true);
  }));
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
    // server.addListener('request', handleHttpsRequest);
  });
}

handleAllMiddleware();
Promise.all([setupHttp(), setupHttp2()]).then(() => console.log('Ready.'));

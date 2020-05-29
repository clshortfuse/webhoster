import HttpRequest from './HttpRequest.js';
import HttpResponse from './HttpResponse.js';
import AsyncObject from '../utils/AsyncObject.js';

/** @typedef {import('stream').Readable} Readable */
/** @typedef {import('stream').Writable} Writable */
/** @typedef {import('./HttpRequest.js').RequestMethod} RequestMethod */

/**
 * @typedef {Object} MiddlewareResultObject
 * @prop {boolean} [completed=false] Completed all middleware chains
 * @prop {boolean} [break=false] Break from current middleware chain
 */

/** @typedef {Promise<MiddlewareResultObject>|MiddlewareResultObject|void} MiddlewareResult */

/**
 * @callback MiddlewareFunction
 * @param {HttpRequest} request
 * @param {HttpResponse} response
 * @return {MiddlewareResult}
 */


/** @typedef {ValueOrIterable<MiddlewareFunction>} Middleware */

/** @type {MiddlewareFunction[]} */
export const DefaultMiddlewareChain = [];

/** @type {Set<Middleware>} */
export const MiddlewareSets = new Set();
MiddlewareSets.add(DefaultMiddlewareChain);

/**
 * @param {HttpRequest} req
 * @param {HttpResponse} res
 * @return {Promise<HttpResponse>}
 */
export function handleRequest(req, res) {
  /**
   * @param {Middleware} middleware
   * @return {Promise<MiddlewareResultObject|void>}
   */
  function handleMiddleware(middleware) {
    if (Symbol.iterator in middleware) {
      const iterator = (/** @type {Iterable<Middleware>} */ (middleware))[Symbol.iterator]();

      /**
       * @param {MiddlewareResultObject} [chainResult]
       * @return {Promise<MiddlewareResultObject|void>}
       */
      const chainLoop = (chainResult) => {
        if (chainResult?.completed || chainResult?.break) {
          return Promise.resolve({ ...chainResult, break: false });
        }
        const chainIteration = iterator.next();
        if (chainIteration.done) return Promise.resolve({ ...chainResult, break: false });
        /** @type {Middleware} */
        const innerMiddleware = chainIteration.value;
        return handleMiddleware(innerMiddleware).then(chainLoop);
      };
      return chainLoop();
    }
    if (typeof middleware === 'function') {
      return Promise.resolve(middleware(req, res));
    }
    return Promise.resolve({});
  }
  return handleMiddleware(MiddlewareSets).then(() => res).catch((err) => {
    console.error(err);
    throw err;
  });
}

/**
 * @param {import('http').IncomingMessage} incomingMessage
 * @param {import('http').ServerResponse} serverResponse
 * @return {Promise<HttpResponse>}
 */
export function handleHttpRequest(incomingMessage, serverResponse) {
  const request = new HttpRequest({
    headers: incomingMessage.headers,
    url: new URL(`http://${incomingMessage.headers.host}${incomingMessage.url}`),
    method: /** @type {RequestMethod} */ (incomingMessage.method?.toUpperCase()),
    originalStream: incomingMessage,
  });
  const response = new HttpResponse({
    originalStream: serverResponse,
    onHeadersSent() {
      return serverResponse.headersSent;
    },
    onSendHeaders(flush) {
      if (response.status == null) return Promise.reject(new Error('NO_STATUS'));
      serverResponse.writeHead(response.status, this.headers);
      if (flush) {
        serverResponse.flushHeaders();
      }
      return Promise.resolve();
    },
  });

  return handleRequest(request, response).then(() => {
    if (!response.headersSent) response.sendHeaders();
    serverResponse.addTrailers(response.trailers);
    response.payload.end();
    return response;
  });
}

/**
 * @param {import('http').IncomingMessage} incomingMessage
 * @param {import('http').ServerResponse} serverResponse
 * @return {Promise<HttpResponse>}
 */
export function handleHttpsRequest(incomingMessage, serverResponse) {
  const request = new HttpRequest({
    headers: incomingMessage.headers,
    url: new URL(`https://${incomingMessage.headers.host}${incomingMessage.url}`),
    method: /** @type {RequestMethod} */ (incomingMessage.method?.toUpperCase()),
    originalStream: incomingMessage,
  });
  const response = new HttpResponse({
    originalStream: serverResponse,
    onHeadersSent() {
      return serverResponse.headersSent;
    },
    onSendHeaders(flush) {
      if (response.status == null) return Promise.reject(new Error('NO_STATUS'));
      serverResponse.writeHead(response.status, this.headers);
      if (flush) {
        serverResponse.flushHeaders();
      }
      return Promise.resolve();
    },
  });

  return handleRequest(request, response).then(() => {
    if (!response.headersSent) response.sendHeaders();
    serverResponse.addTrailers(response.trailers);
    response.payload.end();
    return response;
  });
}

/**
 * @param {import('http2').ServerHttp2Stream} stream
 * @param {import('http2').IncomingHttpHeaders} headers
 * @param {import('./HttpResponse.js').HttpResponseOptions} [responseOptions]
 * @return {Promise<HttpResponse>}
 */
export function handleHttp2Stream(stream, headers, responseOptions = {}) {
  /** @type {Set<AsyncObject<any>>} */
  const pendingPushSyncLocks = new Set();
  const request = new HttpRequest({
    headers,
    url: new URL([
      headers[':scheme'] ?? '',
      '://',
      headers[':authority'] ?? '',
      headers[':path'] ?? '',
    ].join('')),
    method: /** @type {RequestMethod} */ (headers[':method']),
    originalStream: stream,
    canPing: true,
    onPing() {
      return new Promise((resolve, reject) => {
        stream.session.ping((err, duration) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(duration);
        });
      });
    },
  });

  const response = new HttpResponse({
    originalStream: stream,
    canPushPath: stream.pushAllowed,
    onHeadersSent() {
      return stream.headersSent;
    },
    onSendHeaders() {
      if (this.headers[':status'] == null) {
        if (response.status == null) {
          throw new Error('NO_STATUS');
        }
        this.headers[':status'] = response.status;
      }
      stream.respond(this.headers, {
        waitForTrailers: !!this.headers.trailers,
        endStream: false,
      });
    },
    onPushPath(path) {
      const syncLock = new AsyncObject();
      pendingPushSyncLocks.add(syncLock);
      syncLock.prepare();
      return new Promise((resolve, reject) => {
        if (!stream.pushAllowed) {
          reject(new Error('PUSH_NOT_ALLOWED'));
          return;
        }
        const newHeaders = {
          ':scheme': headers[':scheme'],
          ':authority': headers[':authority'],
          ':path': path,
          ':method': 'GET',
        };
        [
          'accept',
          'accept-encoding',
          'accept-language',
          'user-agent',
          'cache-control',
        ].forEach((passedHeader) => {
          if (passedHeader in headers) {
            // @ts-ignore
            newHeaders[passedHeader] = headers[passedHeader];
          }
        });
        stream.pushStream(newHeaders, (err, pushStream) => {
          if (err) {
            pendingPushSyncLocks.delete(syncLock);
            syncLock.set(null);
            reject(err);
            return;
          }
          handleHttp2Stream(pushStream, newHeaders, { canPushPath: false })
            .then(resolve).catch(reject).finally(() => {
              pendingPushSyncLocks.delete(syncLock);
              syncLock.set(null);
            });
        });
      });
    },
    ...responseOptions,
  });
  stream.on('wantTrailers', () => {
    stream.sendTrailers(response.trailers);
  });
  stream.on('error', (err) => {
    console.error(err);
    console.error(headers[':path']);
  });
  return handleRequest(request, response)
    .then(() => {
      if (response.payload === response.originalStream) {
        if (!response.headersSent) {
          response.sendHeaders();
        }
      }
      return Promise.resolve();
    })
    .then(() => Promise.all([...pendingPushSyncLocks.values()]
      .map((syncLock) => syncLock.get().catch(() => {}))))
    .then(() => {
      response.payload.end();
    })
    .then(() => response);
}

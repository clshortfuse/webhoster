import { PassThrough } from 'stream';

import AsyncObject from '../utils/AsyncObject.js';
import { noop } from '../utils/function.js';

import HttpRequest from './HttpRequest.js';
import HttpResponse from './HttpResponse.js';

/** @typedef {import('../types').Middleware} Middleware */
/** @typedef {import('../types').MiddlewareErrorHandler} MiddlewareErrorHandler */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */
/** @typedef {import('../types').MiddlewareFunctionResultType} MiddlewareFunctionResultType */
/** @typedef {import('../types').RequestMethod} RequestMethod */
/** @typedef {import('../types/index.js').HandlerState} HandlerState */

/** @type {HttpHandler} */
let defaultInstance = null;

/**
 * @param {Middleware} middleware
 * @return {boolean}
 */
function isErrorHandler(middleware) {
  return !!middleware && typeof middleware === 'object' && 'onError' in middleware && middleware.onError != null;
}

/**
 * @typedef {Object} HttpHandlerOptions
 * @prop {Middleware[]} [preprocessors]
 * @prop {Set<Middleware>} [middleware]
 * @prop {MiddlewareErrorHandler[]} [errorHandlers]
 */
export default class HttpHandler {
  /** @param {HttpHandlerOptions} options */
  constructor(options = {}) {
    this.preprocessors = options.preprocessors || [];
    this.middleware = options.middleware || new Set();
    this.errorHandlers = options.errorHandlers || [];
    this.handleRequest = this.handleRequest.bind(this);
    this.handleHttp1Request = this.handleHttp1Request.bind(this);
    this.handleHttp2Stream = this.handleHttp2Stream.bind(this);
  }

  /** @return {HttpHandler} */
  static get defaultInstance() {
    if (!defaultInstance) {
      defaultInstance = new HttpHandler();
    }
    return defaultInstance;
  }

  /**
   * @param {Object} params
   * @param {HttpRequest} params.req
   * @param {HttpResponse} params.res
   * @return {Promise<HttpResponse>}
   */
  handleRequest({ req, res }) {
    /** @type {HandlerState} */
    const state = { treeIndex: [] };
    let isInErrorState = false;
    /** @type {any} */
    let caughtError = null;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;
    /**
     * @param {Middleware} middleware
     * @return {Promise<MiddlewareFunctionResult>}
     */
    function handleMiddleware(middleware) {
      const isMiddlewareAnErrorHandler = isErrorHandler(middleware);
      if (isInErrorState) {
        if (isMiddlewareAnErrorHandler) {
          isInErrorState = false;
          /** @type {MiddlewareFunctionResult} */
          let returnValue;
          try {
            returnValue = /** @type {MiddlewareErrorHandler} */ (middleware)
              .onError({
                req, res, state, err: caughtError,
              });
          } catch (err) {
            isInErrorState = true;
            caughtError = err;
            returnValue = 'continue';
          }
          return Promise.resolve().then(() => returnValue);
        }
        if (middleware !== context.errorHandlers) {
        // Consume and advance
          return Promise.resolve();
        }
      } else if (isMiddlewareAnErrorHandler) {
      // Don't run error handler if not in error state.
        return Promise.resolve();
      }

      if (typeof middleware === 'boolean') {
        if (middleware === false) {
          return Promise.resolve('break');
        }
        return Promise.resolve();
      }

      switch (middleware) {
        case 'break':
          return Promise.resolve('break');
        case 'end':
          return Promise.resolve('end');
        case 'continue':
          return Promise.resolve();
        default:
      }

      if (middleware === null || typeof middleware === 'string' || typeof middleware === 'undefined') {
        return Promise.resolve();
      }

      if (middleware instanceof Map) {
        return handleMiddleware(middleware.values());
      }

      if (Symbol.iterator in middleware) {
        const iterator = (/** @type {Iterable<Middleware>} */ (middleware))[Symbol.iterator]();

        /**
         * @param {MiddlewareFunctionResult} [chainResult]
         * @return {Promise<MiddlewareFunctionResult>}
         */
        const chainLoop = (chainResult) => {
          if (chainResult === 'end') {
            return Promise.resolve('end');
          }
          if (chainResult === false || chainResult === 'break') {
            return Promise.resolve();
          }
          if (chainResult != null && chainResult !== true) {
            return handleMiddleware(chainResult).then(chainLoop);
          }
          const chainIteration = iterator.next();
          if (chainIteration.done) return Promise.resolve();
          state.treeIndex[state.treeIndex.length - 1] += 1;
          /** @type {Middleware} */
          const innerMiddleware = chainIteration.value;
          return handleMiddleware(innerMiddleware).then(chainLoop);
        };

        // Start looping
        state.treeIndex.push(-1);
        return chainLoop().then((result) => {
          state.treeIndex.pop();
          return result;
        });
      }

      if (middleware && typeof middleware === 'object') {
        if ('execute' in middleware) {
          if (typeof middleware.execute === 'function') {
            return handleMiddleware(middleware.execute.bind(middleware));
          }
          return handleMiddleware(middleware.execute);
        }
        return handleMiddleware(Object.values(middleware));
      }

      if (typeof middleware !== 'function') {
        console.warn('Unknown middleware', middleware);
        return Promise.resolve();
      }
      return Promise.resolve().then(() => middleware({ req, res, state })).catch((err) => {
        isInErrorState = true;
        caughtError = err;
        return /** @type {'continue'} */ ('continue');
      });
    }

    const allMiddleware = [
      this.preprocessors,
      this.middleware,
      this.errorHandlers,
    ];
    return handleMiddleware(allMiddleware).then(() => {
      if (isInErrorState) {
        isInErrorState = false;
        throw caughtError;
      }
      return res;
    });
  }

  /**
   * @param {import('http').IncomingMessage} incomingMessage
   * @param {import('http').ServerResponse} serverResponse
   * @return {Promise<HttpResponse>}
   */
  handleHttp1Request(incomingMessage, serverResponse) {
    // @ts-ignore If TLSSocketLike
    const protocol = incomingMessage.socket.encrypted ? 'https:' : 'http:';

    let url;
    try {
      url = new URL(`${protocol}//${incomingMessage.headers.host}${incomingMessage.url}`);
    } catch (error) {
      serverResponse.writeHead(400);
      serverResponse.end();
      return Promise.reject(error);
    }

    const req = new HttpRequest({
      headers: incomingMessage.headers,
      method: /** @type {RequestMethod} */ (incomingMessage.method?.toUpperCase()),
      stream: incomingMessage,
      socket: incomingMessage.socket,
      url,
    });

    const res = new HttpResponse({
      stream: serverResponse,
      socket: serverResponse.socket,
      onHeadersSent() {
        return serverResponse.headersSent;
      },
      onSendHeaders(flush) {
        if (res.status == null) return Promise.reject(new Error('NO_STATUS'));
        serverResponse.writeHead(res.status, this.headers);
        if (flush) {
          serverResponse.flushHeaders();
        }
        return Promise.resolve();
      },
    });

    return this.handleRequest({ req, res }).then(() => {
      if (!res.stream.writableEnded) {
        console.warn('Response stream was not ended.');
        res.stream.end();
      }
      return res;
    });
  }

  /**
   * @param {import('http2').ServerHttp2Stream} stream
   * @param {import('http2').IncomingHttpHeaders} headers
   * @param {Partial<import('./HttpResponse.js').HttpResponseOptions>} [responseOptions]
   * @return {Promise<HttpResponse>}
   */
  handleHttp2Stream(stream, headers, responseOptions = {}) {
    let url;
    try {
      url = new URL([
        headers[':scheme'] ?? '',
        '://',
        headers[':authority'] ?? '',
        headers[':path'] ?? '',
      ].join(''));
    } catch (error) {
      stream.respond({ ':status': 400 }, { endStream: true });
      return Promise.reject(error);
    }

    /** @type {Set<AsyncObject<any>>} */
    const pendingPushSyncLocks = new Set();
    const req = new HttpRequest({
      headers,
      url,
      method: /** @type {RequestMethod} */ (headers[':method']),
      stream,
      socket: stream.session.socket,
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

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;
    const res = new HttpResponse({
      stream,
      socket: stream.session.socket,
      canPushPath: stream.pushAllowed,
      onHeadersSent() {
        return stream.headersSent;
      },
      onSendHeaders() {
        if (this.headers[':status'] == null) {
          if (res.status == null) {
            throw new Error('NO_STATUS');
          }
          this.headers[':status'] = res.status;
        }
        stream.respond(this.headers);
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
            // @ts-ignore Coerce
              newHeaders[passedHeader] = headers[passedHeader];
            }
          });
          stream.pushStream(newHeaders, ((err, pushStream) => {
            if (err) {
              pendingPushSyncLocks.delete(syncLock);
              syncLock.set(null);
              reject(err);
              return;
            }
            context.handleHttp2Stream(pushStream, newHeaders, { canPushPath: false })
              .then(resolve).catch(reject).finally(() => {
                pendingPushSyncLocks.delete(syncLock);
                syncLock.set(null);
              });
          }));
        });
      },
      ...responseOptions,
    });

    // Workaround for https://github.com/nodejs/node/issues/31309
    const STREAM_WAIT_MS = 0;
    /** @type {NodeJS.Timeout} */
    let pingTimeout = null;
    /** @return {void} */
    function sendPing() {
      if (stream.session) stream.session.ping(noop);
    }
    const autoPingStream = new PassThrough({
      read(...args) {
        clearTimeout(pingTimeout);
        pingTimeout = setTimeout(sendPing, STREAM_WAIT_MS);
        // eslint-disable-next-line no-underscore-dangle
        return PassThrough.prototype._read.call(this, ...args);
      },
    });
    stream.pipe(autoPingStream);
    req.replaceStream(autoPingStream);

    stream.on('error', (err) => {
      console.error(err);
      console.error(headers[':path']);
    });
    return this.handleRequest({ req, res })
      .then(() => Promise.all([...pendingPushSyncLocks.values()]
        .map((syncLock) => syncLock.get().catch(noop))))
      .then(() => {
        res.stream.end();
      })
      .then(() => res);
  }
}

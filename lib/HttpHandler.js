import { posix } from 'node:path';
import { promisify } from 'node:util';

import { isWritable } from '../utils/stream.js';

import HttpRequest from './HttpRequest.js';
import HttpResponse from './HttpResponse.js';
import HttpTransaction from './HttpTransaction.js';

/** @typedef {import('../types').Middleware} Middleware */
/** @typedef {import('../types').MiddlewareErrorHandler} MiddlewareErrorHandler */
/** @typedef {import('../types').MiddlewareFlowInstruction} MiddlewareFlowInstruction */
/** @typedef {import('../types').RequestMethod} RequestMethod */

/** @type {HttpHandler} */
let defaultInstance = null;

/**
 * @typedef {Object} HttpHandlerOptions
 * @prop {Middleware[]} [middleware]
 * @prop {MiddlewareErrorHandler[]} [errorHandlers]
 */
export default class HttpHandler {
  /** @type {true} */
  static CONTINUE = true;

  /** @type {false} */
  static BREAK = false;

  /** @type {0} */
  static END = 0;

  /** @return {HttpHandler} */
  static get defaultInstance() {
    if (!defaultInstance) {
      defaultInstance = new HttpHandler();
    }
    return defaultInstance;
  }

  /**
   * @param {any} result
   * @return {?MiddlewareFlowInstruction}
   */
  static ParseResultSync(result) {
    // Fast return
    switch (result) {
      case true:
      case null:
      case undefined:
      case HttpHandler.CONTINUE:
        return HttpHandler.CONTINUE;
      case false:
      case HttpHandler.BREAK:
        return HttpHandler.BREAK;
      case 0:
        return HttpHandler.END;
      default:
    }
    return null;
  }

  /**
   * @param {string} scheme
   * @param {string} authority
   * @param {string} path
   */
  static parseURL(scheme, authority, path) {
    let query = '';
    let fragment = '';

    const authoritySplit = authority.split(':');
    let pathname = '';
    let search = '';
    let hash = '';
    const queryIndex = path.indexOf('?');
    const fragmentIndex = path.indexOf('#');
    const hasQuery = queryIndex !== -1;
    const hasFragment = fragmentIndex !== -1;

    // URL variables
    pathname = path;
    if (hasQuery && hasFragment) {
      // Both ? and # present
      if (queryIndex < fragmentIndex) {
        pathname = path.slice(0, queryIndex);
        search = path.slice(queryIndex, fragmentIndex);
        hash = path.slice(fragmentIndex);
        query = search.slice(1);
        fragment = hash.slice(1);
      } else {
        // # comes before ?, treat as no query
        pathname = path.slice(0, fragmentIndex);
        hash = path.slice(fragmentIndex);
        fragment = hash.slice(1);
      }
    } else if (hasQuery) {
      pathname = path.slice(0, queryIndex);
      search = path.slice(queryIndex);
      query = search.slice(1);
    } else if (hasFragment) {
      pathname = path.slice(0, fragmentIndex);
      hash = path.slice(fragmentIndex);
      fragment = hash.slice(1);
    } else {
      pathname = path;
    }
    // Remove dot segments
    pathname = posix.normalize(pathname);

    return {
      href: `${scheme}://${authority}${pathname}${search}${hash}`,
      origin: `${scheme}://${authority}`,
      protocol: `${scheme}:`,
      username: '',
      password: '',
      host: authority,
      hostname: authoritySplit[0],
      port: authoritySplit[1] ?? '',
      pathname,
      search,
      hash,
      query,
      fragment,
      url: `${scheme}://${authority}${path}`,
    };
  }

  /** @param {HttpHandlerOptions} options */
  constructor(options = {}) {
    this.middleware = options.middleware || [];
    this.errorHandlers = options.errorHandlers || [];
    this.handleTransaction = this.handleTransaction.bind(this);
    this.handleHttp1Request = this.handleHttp1Request.bind(this);
    this.handleHttp2Stream = this.handleHttp2Stream.bind(this);
  }

  /**
   * @param {HttpTransaction} transaction
   * @param {Middleware} middleware
   * @return {Promise<MiddlewareFlowInstruction>}
   */
  async processMiddleware(transaction, middleware) {
    if (middleware == null) return HttpHandler.CONTINUE;

    // Check if error handler
    const isErrorHandler = (typeof middleware === 'object'
      && 'onError' in middleware
      && typeof middleware.onError === 'function');

    let value = middleware;
    if (transaction.error) {
      if (isErrorHandler) {
        value = middleware.onError;
      } else if (!transaction.isErrorHandlerState()) {
        if (middleware !== this.errorHandlers) return HttpHandler.CONTINUE;
        transaction.setErrorHandlerState();
      }
    } else if (isErrorHandler) {
      return HttpHandler.CONTINUE;
    }

    let syncResult = HttpHandler.ParseResultSync(value);
    if (syncResult != null) {
      return syncResult;
    }

    /** @type {?MiddlewareFlowInstruction} */
    let result;
    switch (typeof value) {
      case 'number':
        transaction.response.status = value;
        try {
          return transaction.response.end();
        } catch (error) {
          transaction.error = error;
          return HttpHandler.CONTINUE;
        }
      case 'function':
        try {
          result = value.constructor.name === 'AsyncFunction'
            ? await value(transaction)
            : value(transaction);
          if (result == null) {
            if (isErrorHandler) transaction.error = null;
            return HttpHandler.CONTINUE;
          }

          // Sync operation returned Promise
          // @ts-expect-error TS improperly thinks result can be null
          if (typeof result === 'object' && typeof result.then === 'function') {
            if (isErrorHandler) transaction.error = null;
            result = await result;
          }
          syncResult = HttpHandler.ParseResultSync(result);
          if (syncResult != null) {
            if (isErrorHandler) transaction.error = null;
            return syncResult;
          }

          // Slip in support for functions that return an Array
          if (Array.isArray(result)) {
            result = transaction.response.end(result);
            if (isErrorHandler) transaction.error = null;
            return result;
          }

          if (isErrorHandler) transaction.error = null;
          result = await this.processMiddleware(transaction, result);
          return result;
        } catch (error) {
          // console.warn('Caught runtime error', err.message, err.stack);
          transaction.error = error;
          return HttpHandler.CONTINUE;
        }
      case 'object':
        if (Array.isArray(value)) {
          const { treeIndex } = transaction.state;
          treeIndex.push(-1);
          const { length } = value;
          // eslint-disable-next-line no-plusplus
          for (let index = 0; index < length; index++) {
            const innerMiddleware = value[index];
            treeIndex[treeIndex.length - 1] += 1;
            if (innerMiddleware == null) continue;
            result = HttpHandler.ParseResultSync(innerMiddleware);
            if (result == null) {
              // eslint-disable-next-line no-await-in-loop
              result = await this.processMiddleware(transaction, innerMiddleware);
            }

            if (result === HttpHandler.END) {
              break;
            }
            if (result === HttpHandler.BREAK) {
              // Break from branch and continue in parent
              result = HttpHandler.CONTINUE;
              break;
            }
            // Continue in branch
          }
          treeIndex.pop();
          return result;
        }

        if ('execute' in value && typeof value.execute === 'function') {
          return await this.processMiddleware(transaction, value.execute.bind(value));
        }
        // Static caller
        if ('Execute' in value && typeof value.Execute === 'function') {
          return await this.processMiddleware(transaction, value.Execute);
        }
        if ('then' in value && typeof value.then === 'function') {
          return await this.processMiddleware(transaction, await value);
        }
        // Fallthrough for Objects
      case 'string':
        try {
          transaction.response.status ??= value ? 200 : 204;
          return transaction.response.end(value);
        } catch (error) {
          transaction.error = error;
          return HttpHandler.CONTINUE;
        }
      default:
        console.warn('Unknown middleware', value);
        return HttpHandler.CONTINUE;
    }
  }

  /**
   * @param {HttpTransaction} transaction
   * @return {Promise<HttpTransaction>}
   */
  async handleTransaction(transaction) {
    const allMiddleware = [
      this.middleware,
      this.errorHandlers,
    ];

    const finalFinalResponse = await this.processMiddleware(transaction, allMiddleware);
    if (finalFinalResponse !== HttpHandler.END) {
      // console.warn(transaction.request.url, "Middleware resolution did not complete with 'end'");
    } else if (!transaction.response.wasEndCalled()) {
      transaction.response.end();
    }
    if (transaction.error) {
      console.warn('Webhoster did not find error handler. Crash prevented.', transaction.request.path, transaction.error);
      if (!transaction.response.wasEndCalled()) {
        // Use generic error response and don't expose error
        transaction.response.status = 500;
        transaction.response.headers['content-type'] = 'text/plain';
        transaction.response.end('Internal Server Error');
      }
    }
    return transaction;
  }

  /**
   * @param {import('http').IncomingMessage} incomingMessage
   * @param {import('http').ServerResponse} serverResponse
   * @return {Promise<HttpTransaction>}
   */
  async handleHttp1Request(incomingMessage, serverResponse) {
    /** @throws {Error} */
    function onMalformed() {
      const error = new Error('PROTOCOL_ERROR');
      incomingMessage.destroy(error);
      serverResponse.destroy(error);
      throw error;
    }

    const {
      method, headers, socket, url: path,
    } = incomingMessage;

    if (!method) onMalformed();
    // @ts-ignore If TLSSocketLike
    const scheme = socket.encrypted ? 'https' : 'http';
    const authority = headers.host;
    if (!authority) onMalformed();
    if (authority.includes('@')) onMalformed();

    let urlOptions;
    if (method === 'CONNECT') {
      if (scheme || path) onMalformed();
    } else {
      if (!scheme || !path) onMalformed();
      if (path === '*') {
        // asterisk-form
        if (method !== 'OPTIONS') onMalformed();
      } else {
        urlOptions = HttpHandler.parseURL(scheme, authority, path);
      }
    }

    const request = new HttpRequest({
      headers,
      // @ts-expect-error JSDoc syntax limitation
      method,
      stream: incomingMessage,

      scheme,
      authority,
      path,

      ...urlOptions,
    });

    const response = new HttpResponse({
      stream: serverResponse,
      headers: {},
      request,
      onHeadersSent() {
        return serverResponse.headersSent;
      },
      onSendHeaders(flush, end) {
        if (response.status == null) {
          throw new Error('NO_STATUS');
        }
        if (!isWritable(serverResponse)) return false;
        serverResponse.writeHead(response.status, response.headers);
        if (end) {
          serverResponse.end();
        } else if (flush) {
          serverResponse.flushHeaders();
        }
        return true;
      },
    });

    const transaction = new HttpTransaction({
      httpVersion: '2.0',
      request,
      response,
      socket,
      canPing: false,
      canPushPath: false,
    });

    await this.handleTransaction(transaction);

    if (isWritable(serverResponse)) {
      setTimeout(() => {
        if (isWritable(serverResponse)) {
          console.warn('Respond stream end lagging more than 60s. Did you forget to call `.end()`?', request.url);
        }
      }, 60_000);
    }
    return transaction;
  }

  /**
   * @param {import('http2').ServerHttp2Stream} stream
   * @param {import('http2').IncomingHttpHeaders} headers
   * @param {Partial<import('./HttpTransaction.js').HttpTransactionOptions<unknown>>} [transactionOptions]
   * @return {Promise<HttpTransaction>}
   */
  async handleHttp2Stream(stream, headers, transactionOptions = {}) {
    /** @throws {Error} */
    function onMalformed() {
      const error = new Error('PROTOCOL_ERROR');
      stream.destroy(error);
      throw error;
    }

    const {
      ':method': method,
      ':scheme': scheme,
      ':authority': authorityHeader,
      host: hostHeader,
    } = headers;

    if (!method) onMalformed();
    // HTTP/2 to HTTP/1 translation
    const authority = /** @type {string} */ (authorityHeader || hostHeader);
    if (!authority) onMalformed();
    if (authority.includes('@')) onMalformed();

    const path = headers[':path'];

    let urlOptions;
    if (method === 'CONNECT') {
      if (scheme || path) onMalformed();
    } else {
      if (!scheme || !path) onMalformed();
      if (path === '*') {
        // asterisk-form
        if (method !== 'OPTIONS') onMalformed();
      } else {
        urlOptions = HttpHandler.parseURL(scheme, authority, path);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias, unicorn/no-this-assignment
    const context = this;

    /** @type {Promise<any>[]} */
    const pendingStreamLocks = [];

    const request = new HttpRequest({
      headers,
      // @ts-expect-error JSDoc syntax limitation
      method,
      stream,

      scheme,
      authority,
      path,

      ...urlOptions,
    });

    const response = new HttpResponse({
      request,
      stream,
      onHeadersSent() {
        return stream.headersSent;
      },
      onSendHeaders(flush, end) {
        if (response.headers[':status'] == null) {
          if (response.status == null) {
            throw new Error('NO_STATUS');
          }
          response.headers[':status'] = response.status;
        }
        if (!isWritable(stream)) return false;
        stream.respond(response.headers, { endStream: end });
        return true;
      },
    });

    const transaction = new HttpTransaction({
      httpVersion: '2.0',
      request,
      response,
      socket: stream.session.socket,
      canPing: true,
      onPing: promisify(stream.session.ping),
      canPushPath: () => stream.pushAllowed,
      onPushPath: async (pushPath) => {
        if (!stream.pushAllowed) {
          throw new Error('PUSH_NOT_ALLOWED');
        }

        const newHeaders = {
          ':scheme': headers[':scheme'],
          ':authority': headers[':authority'],
          ':path': pushPath,
          ':method': 'GET',
        };
        for (const passedHeader of [
          'accept',
          'accept-encoding',
          'accept-language',
          'user-agent',
          'cache-control',
        ]) {
          if (passedHeader in headers) {
            // @ts-expect-error Coerce
            newHeaders[passedHeader] = headers[passedHeader];
          }
        }

        // Build promise function
        const promiseFunction = async () => {
          try {
            /** @type {import('node:http2').ServerHttp2Stream} */
            const pushStream = await new Promise((resolve, reject) => {
              stream.pushStream(
                newHeaders,
                ((error, newStream) => (error ? reject(error) : resolve(newStream))),
              );
            });
            pushStream.addListener('error', (error) => {
              // @ts-expect-error Missing types
              if (error?.code === 'ECONNRESET') {
                console.warn('HTTP/2 stream connection reset.', headers[':path']);
              } else {
                console.error('HTTP/2 stream error', headers, error);
              }
            });
            await context.handleHttp2Stream(pushStream, newHeaders, { canPushPath: false });
          } catch (error) {
            console.error('onPushFailed', error, error.stack);
            throw error;
          }
        };

        // Schedule microtask
        const promiseExecution = promiseFunction();

        // Add as stream lock
        pendingStreamLocks.push(promiseExecution);

        // Wait for promise to complete before returning
        await promiseExecution;
      },
      ...transactionOptions,
    });

    await this.handleTransaction(transaction);

    if (pendingStreamLocks.length) {
      // Wait for all child push streams to terminate before we return.
      await Promise.allSettled(pendingStreamLocks);
    }

    if (isWritable(stream)) {
      setTimeout(() => {
        if (isWritable(stream)) {
          console.warn('Respond stream end lagging more than 60s. Did you forget to call `.end()`?', request.url);
        }
      }, 60_000);
    }

    return transaction;
  }
}

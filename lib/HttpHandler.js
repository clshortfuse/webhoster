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

    // URL variables
    pathname = path;
    if (queryIndex !== -1) {
      pathname = path.slice(0, queryIndex);
      search = path.slice(queryIndex, fragmentIndex === -1 ? undefined : fragmentIndex);
      query = search.slice(1);
    } else if (fragmentIndex === -1) {
      pathname = path;
    } else {
      pathname = path.slice(0, fragmentIndex);
      hash = path.slice(fragmentIndex);
      fragment = hash.slice(1);
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
    if (typeof middleware === 'object' && typeof middleware.onError === 'function') {
      // Skip it if not errored
      if (!transaction.error) return HttpHandler.CONTINUE;
      // Clear error state
      // eslint-disable-next-line no-param-reassign
      transaction.error = null;
      try {
        let result;
        result = middleware.constructor.name === 'AsyncFunction'
          ? await middleware.onError(transaction)
          : middleware.onError(transaction);
        if (result == null) return HttpHandler.CONTINUE;
        // Sync operation returned Promise
        if (typeof result === 'object' && typeof result.then === 'function') {
          result = await result;
        }
        const syncResult = HttpHandler.ParseResultSync(result);
        if (syncResult != null) return syncResult;

        // Slip in support for functions that return an Array
        if (Array.isArray(result)) {
          return transaction.response.end(result);
        }

        return await this.processMiddleware(transaction, result);
      } catch (error) {
        // Catch failed error handler
        console.warn('Error handler threw an error.', transaction.request.path, error);
        transaction.error = error;
        return HttpHandler.CONTINUE;
      }
    }

    // Is errored, only default error handler allowed further
    if (transaction.error && middleware !== this.errorHandlers) {
      return HttpHandler.CONTINUE;
    }

    let syncResult = HttpHandler.ParseResultSync(middleware);
    if (syncResult != null) {
      return syncResult;
    }

    /** @type {?MiddlewareFlowInstruction} */
    let result;
    switch (typeof middleware) {
      case 'number':
        transaction.response.status = middleware;
        return transaction.response.end();
      case 'function':
        try {
          result = middleware.constructor.name === 'AsyncFunction'
            ? await middleware(transaction)
            : middleware(transaction);
          if (result == null) return HttpHandler.CONTINUE;
          // Sync operation returned Promise
          if (typeof result === 'object' && typeof result.then === 'function') {
            result = await result;
          }
          syncResult = HttpHandler.ParseResultSync(result);
          if (syncResult != null) return syncResult;

          // Slip in support for functions that return an Array
          if (Array.isArray(result)) {
            return transaction.response.end(result);
          }

          return await this.processMiddleware(transaction, result);
        } catch (error) {
          console.warn('Caught runtime error', error.message, error.stack);
          transaction.error = error;
          return HttpHandler.CONTINUE;
        }
      case 'object':
        if (Array.isArray(middleware)) {
          const { treeIndex } = transaction.state;
          treeIndex.push(-1);

          for (const innerMiddleware of middleware) {
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

        if ('execute' in middleware && typeof middleware.execute === 'function') {
          return await this.processMiddleware(transaction, middleware.execute.bind(middleware));
        }
        // Static caller
        if ('Execute' in middleware && typeof middleware.Execute === 'function') {
          return await this.processMiddleware(transaction, middleware.Execute);
        }
        if ('then' in middleware && typeof middleware.then === 'function') {
          return await this.processMiddleware(transaction, await middleware);
        }
        // Fallthrough for Objects
      case 'string':
        return transaction.response.end(middleware);
      default:
        console.warn('Unknown middleware', middleware);
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
      console.warn(transaction.request.url, "Middleware resolution did not complete with 'end'");
    }
    if (transaction.error) {
      console.warn('Webhoster did not find error handler. Crash prevented.', transaction.request.path, transaction.error);
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
    // @ts-expect-error If TLSSocketLike
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

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;

    /** @type {Promise<any>[]} */
    const pendingStreamLocks = [];

    const request = new HttpRequest({
      headers,
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
      onPing: promisify(stream.session.ping).bind(stream.session),
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
            // @ts-ignore Coerce
            newHeaders[passedHeader] = headers[passedHeader];
          }
        }

        // Build promise function
        const promiseFunction = async () => {
          try {
            const pushStream = await new Promise((resolve, reject) => {
              stream.pushStream(newHeaders, ((error, newStream) => (error ? reject(error) : resolve(newStream))));
            });
            pushStream.addListener('error', (error) => {
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

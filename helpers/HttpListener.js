import { createServer as createHttpServer } from 'node:http';
import { createSecureServer as createHttp2Server } from 'node:http2';
import { createServer as createHttpsServer } from 'node:https';
import { Server, Socket } from 'node:net';

import HttpHandler from '../lib/HttpHandler.js';

export const SERVER_ALREADY_CREATED = 'SERVER_ALREADY_CREATED';

/** @typedef {import('tls').TlsOptions} TlsOptions */
/** @typedef {import('http2').Http2Session} Http2Session */
/** @typedef {import('http2').Http2Stream} Http2Stream */

/**
 * @typedef {Object} HttpListenerOptions
 * @prop {HttpHandler} [httpHandler]
 * @prop {number} [insecurePort=8080]
 * @prop {string} [insecureHost] blank defaults to '::' or '0.0.0.0'
 * @prop {number} [securePort=8443]
 * @prop {string} [secureHost] blank defaults to '::' or '0.0.0.0'
 * @prop {boolean} [useHttp=true]
 * @prop {boolean} [useHttps=false]
 * @prop {boolean} [useHttp2=true]
 * @prop {TlsOptions} [tlsOptions]
 */

/** @type {HttpListener} */
let defaultInstance;

export default class HttpListener {
  /** @return {HttpListener} */
  static get defaultInstance() {
    if (!defaultInstance) {
      defaultInstance = new HttpListener();
    }
    return defaultInstance;
  }

  /** @type {(err: Error) => void} */
  #httpErrorListener;

  /** @type {(err: Error, socket: import('node:net').Socket) => void} */
  #httpClientErrorListener;

  /** @type {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} */
  #httpRequestListener;

  /** @type {(err: Error) => void} */
  #httpsErrorListener;

  /** @type {(err: Error, socket: import('node:net').Socket) => void} */
  #httpsClientErrorListener;

  /** @type {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} */
  #httpsRequestListener;

  /** @type {(err: Error) => void} */
  #http2ErrorListener;

  /** @type {(err: Error, socket: import('node:net').Socket) => void} */
  #http2ClientErrorListener;

  /** @type {(err: Error, session: import('node:http2').Http2Session) => void} */
  #http2SessionErrorListener;

  /** @type {(session: import('node:http2').Http2Session) => void} */
  #http2SessionListener;

  /** @type {(stream: import('node:http2').Http2Stream, headers: import('node:http2').IncomingHttpHeaders) => void} */
  #http2StreamListener;

  /** @type {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} */
  #http2RequestListener;

  /** @param {HttpListenerOptions} options */
  constructor(options = {}) {
    this.configure(options);
  }

  /** @param {HttpListenerOptions} options */
  configure(options = {}) {
    this.httpHandler = options.httpHandler ?? HttpHandler.defaultInstance;
    this.insecurePort = options.insecurePort ?? 8080;
    this.insecureHost = options.insecureHost;
    this.securePort = options.securePort ?? 8443;
    this.secureHost = options.secureHost;
    this.useHttp = options.useHttp !== false;
    this.useHttps = options.useHttps === true;
    this.useHttp2 = options.useHttp2 !== false;
    this.tlsOptions = options.tlsOptions ?? {};
  }

  /**
   * @param {import('node:http').ServerOptions} [options]
   * @return {import('node:http').Server}
   */
  createHttpServer(options = {}) {
    if (!this.httpServer) {
      this.httpServer = createHttpServer(options);
    } else if (Object.keys(options).length) {
      throw new Error(SERVER_ALREADY_CREATED);
    }
    return this.httpServer;
  }

  /**
   * @param {import('node:https').ServerOptions} [options]
   * @return {import('node:https').Server}
   */
  createHttpsServer(options = {}) {
    if (!this.httpsServer) {
      this.httpsServer = createHttpsServer({
        ...this.tlsOptions,
        ...options,
      });
    } else if (Object.keys(options).length) {
      throw new Error(SERVER_ALREADY_CREATED);
    }
    return this.httpsServer;
  }

  /**
   * @param {import('node:http2').ServerOptions} [options]
   * @return {import('node:http2').Http2SecureServer}
   */
  createHttp2Server(options = {}) {
    if (!this.http2Server) {
      this.http2Server = createHttp2Server({
        allowHTTP1: true,
        ...this.tlsOptions,
        ...options,
      });
    } else if (Object.keys(options).length) {
      throw new Error(SERVER_ALREADY_CREATED);
    }
    return this.http2Server;
  }

  /** @return {Promise<import('node:http').Server>} */
  startHttpServer() {
    return new Promise((resolve, reject) => {
      this.createHttpServer();
      this.httpServer.listen({
        port: this.insecurePort,
        host: this.insecureHost,
      }, () => {
        this.httpServer.removeListener('error', reject);

        this.httpServer.keepAliveTimeout = 5000;
        this.httpServer.requestTimeout = 300_000;
        this.httpServer.setTimeout(120_000, (socket) => {
          if (!socket) {
            console.warn('HTTP socket (unknown) timed out.');
            return;
          }
          // const identity = `${socket.remoteFamily}:${socket.remoteAddress}:${socket.remotePort}`;
          // console.warn(`HTTP socket ${identity} timed out.`);
          socket.destroy(new Error('SOCKET_TIMEOUT'));
        });

        // Save listeners as private members for later removal
        this.httpServer.addListener('error', this.#httpErrorListener = (error) => {
          // console.error('HTTP server error', err);
        });
        this.httpServer.addListener('clientError', this.#httpClientErrorListener = (error, socket) => {
          if (error?.code === 'ECONNRESET') {
            // console.warn('HTTP client connection reset.');
            return;
          }
          // console.error('HTTP client error', err);
          if (socket.destroyed || socket.writableEnded) return;
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });
        this.httpServer.addListener('request', this.#httpRequestListener = (request, res) => {
          this.httpHandler.handleHttp1Request(request, res).catch((error) => {
            // console.error('HTTP1 handler failed', err);
          });
        });
        resolve(this.httpServer);
      });
      this.httpServer.addListener('error', reject);
    });
  }

  /** @return {Promise<import('node:https').Server>} */
  startHttpsServer() {
    return new Promise((resolve, reject) => {
      this.createHttpsServer();
      this.httpsServer.listen({
        port: this.securePort,
        host: this.secureHost,
      }, () => {
        this.httpsServer.removeListener('error', reject);

        this.httpsServer.keepAliveTimeout = 5000;
        this.httpsServer.requestTimeout = 300_000;
        this.httpsServer.setTimeout(120_000, (socket) => {
          if (!socket) {
            // console.warn('HTTPS socket (unknown) timed out.');
            return;
          }
          // const identity = `${socket.remoteFamily}:${socket.remoteAddress}:${socket.remotePort}`;
          // console.error(`HTTPS socket ${identity} timed out.`);
          socket.destroy(new Error('SOCKET_TIMEOUT'));
        });

        this.httpsServer.addListener('error', this.#httpsErrorListener = (error) => {
          // console.error('HTTPS server error', err);
        });
        this.httpsServer.addListener('clientError', this.#httpsClientErrorListener = (error, socket) => {
          if (error?.code === 'ECONNRESET') {
            console.warn('HTTPS client connection reset.');
            return;
          }
          // console.error('HTTPS client error', err);
          if (socket.destroyed) return;
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });

        this.httpsServer.addListener('request', this.#httpsRequestListener = (request, res) => {
          this.httpHandler.handleHttp1Request(request, res).catch((error) => {
            // console.error('HTTPS handler failed', err);
          });
        });
        resolve(this.httpsServer);
      });
      this.httpsServer.addListener('error', reject);
    });
  }

  /** @return {Promise<import('node:http2').Http2SecureServer>} */
  startHttp2Server() {
    return new Promise((resolve, reject) => {
      this.createHttp2Server();
      this.http2Server.listen({
        port: this.securePort,
        host: this.secureHost,
      }, () => {
        this.http2Server.removeListener('error', reject);

        /** @type {Set<WeakRef<Http2Session>>} */
        const sessions = new Set();
        /** @type {WeakMap<Http2Session, {timestamp:number, identity:string}>} */
        const sessionMetadata = new WeakMap();
        /** @type {Set<WeakRef<Http2Stream>>} */
        const streams = new Set();
        /** @type {WeakMap<Http2Stream, {timestamp:number, identity:string, path:string}>} */
        const streamMetadata = new WeakMap();
        /** @return {void} */
        function logUsage() {
          if (global.gc) {
            console.debug('Perfoming garbage collection.');
            global.gc();
          }
          for (const reference of sessions) {
            const session = reference.deref();
            if (!session) {
              sessions.delete(reference);
              continue;
            }
            const metadata = sessionMetadata.get(session);
            if (session.destroyed) {
              console.warn('SESSION destroyed from', metadata.identity, 'since', metadata.timestamp);
            } else {
              console.debug('SESSION alive from', metadata.identity, 'since', metadata.timestamp);
            }
          }
          for (const reference of streams) {
            const stream = reference.deref();
            if (!stream) {
              streams.delete(reference);
              continue;
            }
            const metadata = streamMetadata.get(stream);
            if (stream.destroyed) {
              console.warn('STREAM destroyed from', metadata.identity, 'since', metadata.timestamp, 'for', metadata.path);
            } else {
              console.debug('STREAM alive from', metadata.identity, 'since', metadata.timestamp, 'for', metadata.path);
            }
          }
          if (sessions.size) {
            console.debug('Active sessions:', sessions.size);
          }
          if (streams.size) {
            console.debug('Active streams:', streams.size);
          }
          if ('process' in globalThis) {
            if ('getActiveResourcesInfo' in globalThis.process) {
              console.dir('Active Resources', globalThis.process.getActiveResourcesInfo());
            }
            if ('_getActiveRequests' in globalThis.process) {
              console.dir('Active Requests', globalThis.process._getActiveRequests());
            }
            if ('_getActiveHandles' in globalThis.process) {
              const handles = globalThis.process._getActiveHandles();
              for (const handle of handles) {
                if (handle instanceof Socket) {
                  console.debug('Active Handle (Socket)', `${handle.localAddress}:${handle.localPort} <=> ${handle.remoteAddress}:${handle.remotePort}`);
                } else if (handle instanceof Server) {
                  console.debug('Active Handle (Server)', `${handle.address()?.port}`);
                } else {
                  console.debug('Active Handle (unknown)', handle);
                }
              }
            }
          }
        }
        // setInterval(logUsage, 300_000);
        // logUsage();

        this.http2Server.setTimeout(120_000, (socket) => {
          if (!socket) {
            console.warn('HTTP2 socket (unknown) timed out.');
            return;
          }
          // const identity = `${socket.remoteFamily}:${socket.remoteAddress}:${socket.remotePort}`;
          // console.warn(`HTTP2 socket ${identity} timed out.`);
          socket.destroy(new Error('SOCKET_TIMEOUT'));
        });

        // Error Handlers
        this.http2Server.addListener('error', this.#http2ErrorListener = (error) => {
          console.error('HTTP/2 server error', error);
        });
        this.http2Server.addListener('clientError', this.#http2ClientErrorListener = (error, socket) => {
          // No clear way to signal back to client why a socket has failed because
          // it's unsure if it's HTTP1 or HTTP2. Just destroy and log server-side.
          if (error?.code === 'ECONNRESET') {
            // console.warn('HTTP/2 client connection reset.');
          } else {
            console.error('HTTP/2 client error', error);
          }
          if (!socket.destroyed) socket.destroy(error);
        });
        this.http2Server.addListener('sessionError', this.#http2SessionErrorListener = (error, session) => {
          if (error?.code === 'ECONNRESET') {
            // console.warn('HTTP/2 client connection reset.');
          } else if (error?.message === 'SOCKET_TIMEOUT') {
            // Server generated error
          } else {
            console.error('HTTP/2 sessionError error', error);
          }
          if (!session.destroyed) session.destroy(error);
        });

        this.http2Server.addListener('session', this.#http2SessionListener = (session) => {
          sessions.add(new WeakRef(session));
          const identity = `${session.socket.remoteFamily}:${session.socket.remoteAddress}:${session.socket.remotePort}`;
          sessionMetadata.set(session, {
            timestamp: performance.now(),
            identity,
          });
          session.setTimeout(60_000, () => {
            // console.warn(`HTTP/2 session ${identity} timed out.`);
            session.destroy(new Error('SESSION_TIMEOUT'));
          });
          const pingInterval = setInterval(() => {
            if (session.destroyed) {
              clearInterval(pingInterval);
            } else {
              session.ping((error) => {
                if (!error) return;
                if (session.destroyed) return;
                if (error.code === 'ERR_HTTP2_PING_CANCEL') return;
                console.error(`Ping to ${identity} failed.`, error);
              });
            }
          }, 15_000);
          session.addListener('close', () => {
            clearInterval(pingInterval);
          });
        });

        // Logic handlers
        this.http2Server.addListener('stream', this.#http2StreamListener = (stream, headers) => {
          streams.add(new WeakRef(stream));
          streamMetadata.set(stream, {
            timestamp: performance.now(),
            identity: `${stream.session?.socket.remoteFamily}:${stream.session?.socket.remoteAddress}:${stream.session?.socket.remotePort}`,
            path: headers[':path'],
          });

          stream.setTimeout(300_000, () => {
            stream.destroy(new Error('SOCKET_TIMEOUT'));
          });
          stream.addListener('error', (error) => {
            if (error?.code === 'ECONNRESET') {
              // console.warn('HTTP/2 stream connection reset.', headers[':path']);
            } else {
              console.error('HTTP/2 stream error', headers, error);
            }
          });
          this.httpHandler.handleHttp2Stream(stream, headers).catch((error) => {
            console.error('HTTP2 handler failed.', error);
          });
        });
        this.http2Server.addListener('request', this.#http2RequestListener = (request, res) => {
          if (request.httpVersionMajor >= 2) return;
          // @ts-ignore Ignore typings
          request.setTimeout(300_000, (socket) => {
            if (!socket) {
              // console.warn('HTTP1 in HTTP2 request (unknown) timed out.');
              return;
            }
            // const identity = `${socket.remoteFamily}:${socket.remoteAddress}:${socket.remotePort}`;
            // console.warn(`HTTP1 in HTTP2 request ${identity} timed out.`);
            socket.destroy(new Error('SOCKET_TIMEOUT'));
          });
          res.setTimeout(300_000, (socket) => {
            if (!socket) {
              // console.warn('HTTP1 in HTTP2 response (unknown) timed out.');
              return;
            }
            const identity = `${socket.remoteFamily}:${socket.remoteAddress}:${socket.remotePort}`;
            // console.warn(`HTTP1 in HTTP2 response ${identity} timed out.`);
            socket.destroy(new Error('SOCKET_TIMEOUT'));
          });
          request.addListener('error', (error) => {
            if (error?.code === 'ECONNRESET') {
              // console.warn('Request stream connection reset.', req.url);
            } else {
              console.error('Request stream error.', request.url, request.headers, error);
            }
            if (!request.destroyed) {
              request.destroy(error);
            }
          });
          res.addListener('error', (error) => {
            if (error?.code === 'ECONNRESET') {
              // console.warn('Response stream connection reset.', req.url);
            } else {
              console.error('Response stream error', request.url, request.headers, error);
            }
            if (!res.destroyed) {
              res.destroy(error);
            }
          });
          this.httpHandler.handleHttp1Request(request, res).catch((error) => {
            console.error('HTTP1 in HTTP2 handler failed.', error);
          });
        });

        resolve(this.http2Server);
      });
      this.http2Server.addListener('error', reject);
    });
  }

  /** @return {Promise<void>} */
  stopHttpServer() {
    return new Promise((resolve, reject) => {
      if (!this.httpServer) {
        resolve();
        return;
      }
      this.httpServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (this.#httpRequestListener) {
          this.httpServer.removeListener('request', this.#httpRequestListener);
        }
        if (this.#httpErrorListener) {
          this.httpServer.removeListener('error', this.#httpErrorListener);
        }
        if (this.#httpClientErrorListener) {
          this.httpServer.removeListener('clientError', this.#httpClientErrorListener);
        }
        resolve();
      });
    });
  }

  /** @return {Promise<void>} */
  stopHttpsServer() {
    return new Promise((resolve, reject) => {
      if (!this.httpsServer) {
        resolve();
        return;
      }
      this.httpsServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (this.#httpsRequestListener) {
          this.httpsServer.removeListener('request', this.#httpsRequestListener);
        }
        if (this.#httpsErrorListener) {
          this.httpsServer.removeListener('error', this.#httpsErrorListener);
        }
        if (this.#httpsClientErrorListener) {
          this.httpsServer.removeListener('clientError', this.#httpsClientErrorListener);
        }
        resolve();
      });
    });
  }

  /** @return {Promise<void>} */
  stopHttp2Server() {
    return new Promise((resolve, reject) => {
      if (!this.http2Server) {
        resolve();
        return;
      }
      this.http2Server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (this.#http2ErrorListener) {
          this.http2Server.removeListener('error', this.#http2ErrorListener);
        }
        if (this.#http2ClientErrorListener) {
          this.http2Server.removeListener('clientError', this.#http2ClientErrorListener);
        }
        if (this.#http2SessionErrorListener) {
          this.http2Server.removeListener('sessionError', this.#http2SessionErrorListener);
        }
        if (this.#http2SessionListener) {
          this.http2Server.removeListener('session', this.#http2SessionListener);
        }
        if (this.#http2StreamListener) {
          this.http2Server.removeListener('stream', this.#http2StreamListener);
        }
        if (this.#http2RequestListener) {
          this.http2Server.removeListener('request', this.#http2RequestListener);
        }

        resolve();
      });
    });
  }

  /**
   * @return {Promise<[
   *  import('node:http').Server,
   *  import('node:https').Server,
   *  import('node:http2').Http2SecureServer
   * ]>
   * }
   */
  startAll() {
    return Promise.all([
      this.useHttp ? this.startHttpServer() : Promise.resolve(null),
      this.useHttps ? this.startHttpsServer() : Promise.resolve(null),
      this.useHttp2 ? this.startHttp2Server() : Promise.resolve(null),
    ]);
  }

  /**
   * @return {Promise<void>}
   */
  async stopAll() {
    await Promise.all([
      this.useHttp ? this.stopHttpServer() : Promise.resolve(null),
      this.useHttps ? this.stopHttpsServer() : Promise.resolve(null),
      this.useHttp2 ? this.stopHttp2Server() : Promise.resolve(null),
    ]);
  }
}

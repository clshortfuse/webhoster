import { createServer as createHttpServer } from 'node:http';
import { createSecureServer as createHttp2Server } from 'node:http2';
import { createServer as createHttpsServer } from 'node:https';

import HttpHandler from '../lib/HttpHandler.js';

export const SERVER_ALREADY_CREATED = 'SERVER_ALREADY_CREATED';

/** @typedef {import('tls').TlsOptions} TlsOptions */

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

  /** @param {HttpListenerOptions} options */
  constructor(options = {}) {
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
          const identity = `${socket.remoteFamily}:${socket.remoteAddress}:${socket.remotePort}`;
          // console.warn(`HTTP socket ${identity} timed out.`);
          socket.destroy(new Error('SOCKET_TIMEOUT'));
        });

        this.httpServer.addListener('error', (err) => {
          console.error('HTTP server error', err);
        });
        this.httpServer.addListener('clientError', (err, socket) => {
          if (err?.code === 'ECONNRESET') {
            // console.warn('HTTP client connection reset.');
            return;
          }
          console.error('HTTP client error', err);
          if (socket.destroyed || socket.writableEnded) return;
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });

        this.httpServer.addListener('request', (req, res) => {
          this.httpHandler.handleHttp1Request(req, res).catch((err) => {
            console.error('HTTP1 handler failed', err);
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
          const identity = `${socket.remoteFamily}:${socket.remoteAddress}:${socket.remotePort}`;
          // console.error(`HTTPS socket ${identity} timed out.`);
          socket.destroy(new Error('SOCKET_TIMEOUT'));
        });

        this.httpsServer.addListener('error', (err) => {
          console.error('HTTPS server error', err);
        });
        this.httpsServer.addListener('clientError', (err, socket) => {
          if (err?.code === 'ECONNRESET') {
            console.warn('HTTPS client connection reset.');
            return;
          }
          console.error('HTTPS client error', err);
          if (socket.destroyed) return;
          socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        });

        this.httpsServer.addListener('request', (req, res) => {
          this.httpHandler.handleHttp1Request(req, res).catch((err) => {
            console.error('HTTPS handler failed', err);
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

        /** @type {Set<WeakRef<import('node:http2').Http2Session>} */
        const sessions = new Set();
        /** @type {WeakMap<import('node:http2').Http2Session, {timestamp:number, identity:string}>} */
        const sessionMetadata = new WeakMap();
        /** @type {Set<WeakRef<import('node:http2').Http2Stream>} */
        const streams = new Set();
        /** @type {WeakMap<import('node:http2').Http2Stream, {timestamp:number, identity:string, path:string}>} */
        const streamMetadata = new WeakMap();
        setInterval(() => {
          if (global.gc) {
            console.log('Perfoming garbage collection.');
            global.gc();
          }
          for (const ref of sessions) {
            const session = ref.deref();
            if (!session) {
              sessions.delete(ref);
              continue;
            }
            const metadata = sessionMetadata.get(session);
            if (session.destroyed) {
              console.warn('SESSION destroyed from', metadata.identity, 'since', metadata.timestamp);
            } else {
              console.log('SESSION alive from', metadata.identity, 'since', metadata.timestamp);
            }
          }
          for (const ref of streams) {
            const stream = ref.deref();
            if (!stream) {
              streams.delete(ref);
              continue;
            }
            const metadata = streamMetadata.get(stream);
            if (stream.destroyed) {
              console.warn('STREAM destroyed from', metadata.identity, 'since', metadata.timestamp, 'for', metadata.path);
            } else {
              console.log('STREAM alive from', metadata.identity, 'since', metadata.timestamp, 'for', metadata.path);
            }
          }
          if (sessions.size) {
            console.log('Active sessions:', sessions.size);
          }
          if (streams.size) {
            console.log('Active streams:', streams.size);
          }
        }, 300_000);

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
        this.http2Server.addListener('error', (err) => {
          console.error('HTTP/2 server error', err);
        });
        this.http2Server.addListener('clientError', (err, socket) => {
          // No clear way to signal back to client why a socket has failed because
          // it's unsure if it's HTTP1 or HTTP2. Just destroy and log server-side.
          if (err?.code === 'ECONNRESET') {
            // console.warn('HTTP/2 client connection reset.');
          } else {
            console.error('HTTP/2 client error', err);
          }
          if (!socket.destroyed) socket.destroy(err);
        });
        this.http2Server.addListener('sessionError', (err, session) => {
          if (err?.code === 'ECONNRESET') {
            // console.warn('HTTP/2 client connection reset.');
          } else if (err?.message === 'SOCKET_TIMEOUT') {
            // Server generated error
          } else {
            console.error('HTTP/2 sessionError error', err);
          }
          if (!session.destroyed) session.destroy(err);
        });

        this.http2Server.addListener('session', (session) => {
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
              session.ping((err) => {
                if (!err) return;
                if (session.destroyed) return;
                if (err.code === 'ERR_HTTP2_PING_CANCEL') return;
                console.error(`Ping to ${identity} failed.`, err);
              });
            }
          }, 15_000);
          session.addListener('close', () => {
            clearInterval(pingInterval);
          });
        });

        // Logic handlers
        this.http2Server.addListener('stream', (stream, headers) => {
          streams.add(new WeakRef(stream));
          streamMetadata.set(stream, {
            timestamp: performance.now(),
            identity: `${stream.session?.socket.remoteFamily}:${stream.session?.socket.remoteAddress}:${stream.session?.socket.remotePort}`,
            path: headers[':path'],
          });

          stream.setTimeout(300_000, () => {
            stream.destroy(new Error('SOCKET_TIMEOUT'));
          });
          stream.addListener('error', (err) => {
            if (err?.code === 'ECONNRESET') {
              // console.warn('HTTP/2 stream connection reset.', headers[':path']);
            } else {
              console.error('HTTP/2 stream error', headers, err);
            }
          });
          this.httpHandler.handleHttp2Stream(stream, headers).catch((err) => {
            console.error('HTTP2 handler failed.', err);
          });
        });
        this.http2Server.addListener('request', (req, res) => {
          if (req.httpVersionMajor >= 2) return;
          // @ts-ignore Ignore typings
          req.setTimeout(300_000, (socket) => {
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
          req.addListener('error', (err) => {
            if (err?.code === 'ECONNRESET') {
              // console.warn('Request stream connection reset.', req.url);
            } else {
              console.error('Request stream error.', req.url, req.headers, err);
            }
            if (!req.destroyed) {
              req.destroy(err);
            }
          });
          res.addListener('error', (err) => {
            if (err?.code === 'ECONNRESET') {
              // console.warn('Response stream connection reset.', req.url);
            } else {
              console.error('Response stream error', req.url, req.headers, err);
            }
            if (!res.destroyed) {
              res.destroy(err);
            }
          });
          this.httpHandler.handleHttp1Request(req, res).catch((err) => {
            console.error('HTTP1 in HTTP2 handler failed.', err);
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
      this.httpServer.close((err) => {
        if (err) {
          reject(err);
          return;
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
      this.httpsServer.close((err) => {
        if (err) {
          reject(err);
          return;
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
      this.http2Server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * @return {Promise<[import('node:http').Server, import('node:https').Server, import('node:http2').Http2SecureServer]>}
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

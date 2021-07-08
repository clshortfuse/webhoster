import http from 'http';
import https from 'https';
import http2 from 'http2';
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

  /** @return {HttpListener} */
  static get defaultInstance() {
    if (!defaultInstance) {
      defaultInstance = new HttpListener();
    }
    return defaultInstance;
  }

  /**
   * @param {http.ServerOptions} [options]
   * @return {http.Server}
   */
  createHttpServer(options = {}) {
    if (!this.httpServer) {
      this.httpServer = http.createServer(options);
    } else if (Object.keys(options).length) {
      throw new Error(SERVER_ALREADY_CREATED);
    }
    return this.httpServer;
  }

  /**
   * @param {https.ServerOptions} [options]
   * @return {https.Server}
   */
  createHttpsServer(options = {}) {
    if (!this.httpsServer) {
      this.httpsServer = https.createServer({
        ...this.tlsOptions,
        ...options,
      });
    } else if (Object.keys(options).length) {
      throw new Error(SERVER_ALREADY_CREATED);
    }
    return this.httpsServer;
  }

  /**
   * @param {http2.ServerOptions} [options]
   * @return {http2.Http2SecureServer}
   */
  createHttp2Server(options = {}) {
    if (!this.http2Server) {
      this.http2Server = http2.createSecureServer({
        allowHTTP1: true,
        ...this.tlsOptions,
        ...options,
      });
    } else if (Object.keys(options).length) {
      throw new Error(SERVER_ALREADY_CREATED);
    }
    return this.http2Server;
  }

  /** @return {Promise<http.Server>} */
  startHttpServer() {
    return new Promise((resolve, reject) => {
      this.createHttpServer();
      this.httpServer.listen({
        port: this.insecurePort,
        host: this.insecureHost,
      }, () => {
        this.httpServer.removeListener('error', reject);
        this.httpServer.addListener('request', this.httpHandler.handleHttp1Request);
        resolve(this.httpServer);
      });
      this.httpServer.addListener('error', reject);
    });
  }

  /** @return {Promise<https.Server>} */
  startHttpsServer() {
    return new Promise((resolve, reject) => {
      this.createHttpsServer();
      this.httpsServer.listen({
        port: this.securePort,
        host: this.secureHost,
      }, () => {
        this.httpsServer.removeListener('error', reject);
        this.httpsServer.addListener('request', this.httpHandler.handleHttp1Request);
        resolve(this.httpsServer);
      });
      this.httpsServer.addListener('error', reject);
    });
  }

  /** @return {Promise<http2.Http2SecureServer>} */
  startHttp2Server() {
    return new Promise((resolve, reject) => {
      this.createHttp2Server();
      this.http2Server.listen({
        port: this.securePort,
        host: this.secureHost,
      }, () => {
        this.http2Server.removeListener('error', reject);
        this.http2Server.addListener('stream', this.httpHandler.handleHttp2Stream);
        this.http2Server.addListener('request', (req, res) => {
          if (req.httpVersionMajor >= 2) return;
          // @ts-ignore Ignore typings
          this.httpHandler.handleHttp1Request(req, res);
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
   * @return {Promise<[http.Server, https.Server, http2.Http2SecureServer]>}
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
  stopAll() {
    return Promise.all([
      this.useHttp ? this.stopHttpServer() : Promise.resolve(null),
      this.useHttps ? this.stopHttpsServer() : Promise.resolve(null),
      this.useHttp2 ? this.stopHttp2Server() : Promise.resolve(null),
    ]).then(() => null);
  }
}

import CaseInsensitiveObject from '../utils/CaseInsensitiveObject.js';

/** @typedef {import('stream').Readable} Readable */
/** @typedef {import('../types').RequestMethod} RequestMethod */
/** @typedef {import('http').IncomingHttpHeaders} IncomingHttpHeaders */

/**
 * @typedef {Object} HttpRequestOptions
 * @prop {RequestMethod} method always uppercase
 * @prop {URL} url
 * @prop {IncomingHttpHeaders} [headers]
 * @prop {Object<string,any>} [locals]
 * @prop {Readable} [stream]
 * @prop {import('net').Socket|import('tls').TLSSocket} [socket]
 * @prop {boolean} [canPing]
 * @prop {function():Promise<any>} [onPing]
 */

export default class HttpRequest {
  #canPing = false;

  /** @type {function():Promise<any>} */
  #onPing = null;

  /** @param {HttpRequestOptions} options */
  constructor(options) {
    /** @type {RequestMethod} */
    this.method = (options.method.toUpperCase());
    this.url = options.url;
    /** @type {IncomingHttpHeaders} */
    this.headers = (new CaseInsensitiveObject(options.headers || {}));
    this.stream = options.stream;
    this.socket = options.socket;
    this.#canPing = options.canPing ?? false;
    this.#onPing = options.onPing;
    this.locals = options.locals || {};
  }

  /**
   * @param {Readable} stream
   * @return {Readable} previousStream
   */
  replaceStream(stream) {
    const previousStream = this.stream;
    this.stream = stream;
    return previousStream;
  }

  get canPing() {
    return this.#canPing;
  }

  /**
   * @return {Promise<any>}
   */
  ping() {
    if (!this.#onPing) {
      return Promise.reject(new Error('NOT_IMPLEMENTED'));
    }
    if (!this.#canPing) {
      return Promise.reject(new Error('NOT_SUPPORTED'));
    }
    return this.#onPing();
  }
}

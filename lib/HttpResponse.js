/** @typedef {import('stream').Writable} Writable */

/** @typedef {import('http').OutgoingHttpHeaders} OutgoingHttpHeaders */

/**
 * @typedef {Object} HttpResponseOptions
 * @prop {OutgoingHttpHeaders} [headers]
 * @prop {function():boolean} [onHeadersSent]
 * @prop {function(boolean):void} [onSendHeaders]
 * @prop {number} [status]
 * @prop {Writable} [stream]
 * @prop {import('net').Socket|import('tls').TLSSocket} [socket]
 * @prop {boolean} [canPushPath]
 * @prop {function(string):Promise<any>} [onPushPath]
 * @prop {Object<string,any>} [locals]
 * @prop {boolean} [unsealed]
 */

export default class HttpResponse {
  /** @type {function():boolean} */
  #onHeadersSent = null;

  /** @type {function(boolean):void} */
  #onSendHeaders = null;

  /** @type {function(string):Promise<any>} */
  #onPushPath = null;

  /** @type {boolean} */
  #headersSent = false;

  /** @type {Array<string>} */
  #pushedPaths = [];

  #canPushPath = false;

  /** @param {HttpResponseOptions} options */
  constructor(options) {
    /** @type {OutgoingHttpHeaders} */
    this.headers = options.headers || {};
    this.stream = options.stream;
    this.socket = options.socket;
    this.status = options.status;
    this.#onPushPath = options.onPushPath;
    this.#onHeadersSent = options.onHeadersSent;
    this.#onSendHeaders = options.onSendHeaders;
    this.#canPushPath = options.canPushPath ?? false;
    this.locals = options.locals || {};
    this.unsealed = options.unsealed ?? false;
    if (!this.unsealed) {
      Object.seal(this);
    }
  }

  get headersSent() {
    if (this.#onHeadersSent) {
      return this.#onHeadersSent();
    }
    return this.#headersSent;
  }

  /**
   * @param {Writable} stream
   * @return {Writable} previousStream
   */
  replaceStream(stream) {
    const previousStream = this.stream;
    this.stream = stream;
    return previousStream;
  }

  /**
   * @param {boolean} [flush]
   * @return {void}
   */
  sendHeaders(flush) {
    if (this.headersSent) {
      throw new Error('ALREADY_SENT');
    }
    if (!this.#onSendHeaders) {
      throw new Error('NOT_IMPLEMENTED');
    }
    this.#onSendHeaders(flush);
    this.#headersSent = true;
  }

  get pushedPaths() {
    return this.#pushedPaths;
  }

  get canPushPath() {
    return this.#canPushPath;
  }

  /**
   * @param {string} [path]
   * @return {Promise<any>}
   */
  pushPath(path) {
    if (this.#pushedPaths.includes(path)) {
      return Promise.reject(new Error('ALREADY_PUSHED'));
    }
    if (!this.#onPushPath) {
      return Promise.reject(new Error('NOT_IMPLEMENTED'));
    }
    if (!this.#canPushPath) {
      return Promise.reject(new Error('NOT_SUPPORTED'));
    }
    return this.#onPushPath(path);
  }
}

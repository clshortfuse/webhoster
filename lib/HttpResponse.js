/** @typedef {import('stream').Writable} Writable */

import AsyncObject from '../utils/AsyncObject.js';
import CaseInsensitiveObject from '../utils/CaseInsensitiveObject.js';

/**
 * @typedef {Object} HttpResponseOptions
 * @prop {Object<string,any>} [headers]
 * @prop {Object<string,any>} [trailers]
 * @prop {function():boolean} [onHeadersSent]
 * @prop {function(boolean):void} [onSendHeaders]
 * @prop {number} [status]
 * @prop {Writable} [originalStream]
 * @prop {Writable} [payload]
 * @prop {boolean} [canPushPath]
 * @prop {function(string):Promise<any>} [onPushPath]
 */

export default class HttpResponse {
  /** @type {AsyncObject<string>} */
  #payloadAsString = new AsyncObject(null);

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
    /** @type {Object<string, any>} */
    this.headers = new CaseInsensitiveObject(options.headers || {});
    /** @type {Object<string, any>} */
    this.trailers = new CaseInsensitiveObject(options.trailers || {});
    this.originalStream = options.originalStream || options.payload;
    this.payload = options.payload || options.originalStream;
    this.status = options.status;
    this.#onPushPath = options.onPushPath;
    this.#onHeadersSent = options.onHeadersSent;
    this.#onSendHeaders = options.onSendHeaders;
    this.#canPushPath = options.canPushPath ?? false;
  }

  get headersSent() {
    if (this.#onHeadersSent) {
      return this.#onHeadersSent();
    }
    return this.#headersSent;
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

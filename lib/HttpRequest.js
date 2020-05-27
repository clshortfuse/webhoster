/** @typedef {import('stream').Readable} Readable */

import AsyncObject from '../utils/AsyncObject.js';
import CaseInsensitiveObject from '../utils/CaseInsensitiveObject.js';

/**
 * @typedef {Object} HttpRequestOptions
 * @prop {'GET'|'POST'|'PUT'|'DELETE'|'PATCH'|string} method
 * @prop {URL} url
 * @prop {Object} [headers]
 * @prop {Readable} [originalStream]
 * @prop {Readable} [data]
 * @prop {boolean} [canPing]
 * @prop {function():Promise<any>} [onPing]
 */

export default class HttpRequest {
  #canPing = false;

  /** @type {function():Promise<any>} */
  #onPing = null;

  /** @param {HttpRequestOptions} options */
  constructor(options) {
    this.method = options.method;
    this.url = options.url;
    /** @type {Object<string, any>} */
    this.headers = (new CaseInsensitiveObject(options.headers || {}));
    this.originalStream = options.originalStream || options.data;
    this.data = options.data || options.originalStream;
    this.#canPing = options.canPing ?? false;
    this.#onPing = options.onPing;
  }

  /**
   * @param {Readable} stream
   * @return {void}
   */
  replaceStream(stream) {
    this.data = stream;
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

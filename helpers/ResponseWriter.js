/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */

import HeadersParser from './HeadersHandler.js';

/**
 * @typedef {Object} ResponseWriterOptions
 * @param {boolean} [cache=true]
 */


/** @type {WeakMap<HttpResponse, ResponseWriter>} */
const cache = new WeakMap();

export default class ResponseWriter {
  /**
   * @param {HttpResponse} response
   * @param {ResponseWriterOptions} [options]
   */
  constructor(response, options) {
    const o = {
      cache: true,
      ...options,
    };
    if (o.cache !== false) {
      if (cache.has(response)) {
        return cache.get(response);
      }
      cache.set(response, this);
    }
    this.response = response;
  }

  /**
   * Sets contentLength if blank,
   * sendsHeaders if not sent,
   * and calls payload.write()
   * @param {Buffer} buffer
   * @return {void}
   */
  sendBuffer(buffer) {
    if (this.response.payload === this.response.originalStream) {
      // If payload is a direct stream, set Content-Length and send headers
      if (!this.response.headersSent) {
        const hp = new HeadersParser(this.response.headers);
        if (hp.contentLength == null) {
          hp.contentLength = buffer.byteLength;
        }
        this.response.sendHeaders();
      }
    }

    this.response.payload.write(buffer);
  }

  /**
   * Sets `charset` to `utf-8` if blank,
   * and passes `Buffer.from` result to `.sendBuffer()`
   * @param {string} string
   * @return {void}
   */
  sendString(string) {
    const hp = new HeadersParser(this.response.headers);
    if (!hp.charset) {
      hp.charset = 'utf-8';
    }
    const content = Buffer.from(string, hp.charset);
    this.sendBuffer(content);
  }

  /**
   * Sets mediaType to 'application/json' if blank,
   * and calls result of JSON.stringify() to .sendString()
   * @param {Object} object
   * @return {void}
   */
  sendJson(object) {
    const hp = new HeadersParser(this.response.headers);
    if (!hp.mediaType) {
      hp.mediaType = 'application/json';
    }
    const string = JSON.stringify(object);
    this.sendString(string);
  }


  /**
   * Calls .sendJson(), .sendString() or .sendBuffer() based on value type
   * @param {Object|Buffer|String} value
   * @return {void}
   */
  send(value) {
    if (typeof value === 'string') return this.sendString(value);
    if (Buffer.isBuffer(value)) return this.sendBuffer(value);
    return this.sendJson(value);
  }
}

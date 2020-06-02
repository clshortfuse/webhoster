import ResponseHeaders from './ResponseHeaders.js';

/** @typedef {import('../types').HttpResponse} HttpResponse */

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
   * Sends headers if not sent,
   * and calls payload.write()
   * @param {Buffer} buffer
   * @return {void}
   */
  writeBuffer(buffer) {
    if (this.response.payload === this.response.rawStream) {
      // If payload is a direct stream, send headers
      if (!this.response.headersSent) {
        this.response.sendHeaders();
      }
    }

    this.response.payload.write(buffer);
  }

  /**
   * Sets `charset` to `utf-8` if blank,
   * and passes `Buffer.from` result to `.writeBuffer()`
   * @param {string} string
   * @return {void}
   */
  writeString(string) {
    const resHeaders = new ResponseHeaders(this.response);
    if (!this.response.headersSent && !resHeaders.charset) {
      resHeaders.charset = 'utf-8';
    }
    const content = Buffer.from(string, resHeaders.charsetAsBufferEncoding || 'utf-8');
    this.writeBuffer(content);
  }

  /**
   * Sets contentLength if blank,
   * sends headers if not sent,
   * and calls payload.write()
   * @param {Buffer} buffer
   * @return {void}
   */
  sendBuffer(buffer) {
    if (this.response.payload === this.response.rawStream) {
      // If payload is a direct stream, set Content-Length and send headers
      if (!this.response.headersSent) {
        const resHeaders = new ResponseHeaders(this.response);
        if (resHeaders.contentLength == null) {
          resHeaders.contentLength = buffer.byteLength;
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
    const resHeaders = new ResponseHeaders(this.response);
    if (!this.response.headersSent && !resHeaders.charset) {
      resHeaders.charset = 'utf-8';
    }
    const content = Buffer.from(string, resHeaders.charsetAsBufferEncoding || 'utf-8');
    this.sendBuffer(content);
  }

  /**
   * Sets mediaType to 'application/json' if blank,
   * and calls result of JSON.stringify() to .sendString()
   * @param {Object} object
   * @return {void}
   */
  sendJson(object) {
    const resHeaders = new ResponseHeaders(this.response);
    if (!resHeaders.mediaType) {
      resHeaders.mediaType = 'application/json';
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

/** @typedef {import('../lib/HttpRequest.js').default} HttpRequest */

import HeadersParser from './HeadersHandler.js';
import AsyncObject from '../utils/AsyncObject.js';

/**
 * @typedef {Object} RequestReaderOptions
 * @param {boolean} [cache=true]
 */

const BUFFER_SIZE = 4096;
const STREAM_WAIT_MS = 0;

/** @type {WeakMap<HttpRequest, RequestReader>} */
const cache = new WeakMap();

export default class RequestReader {
  /** @type {AsyncObject<Buffer>} */
  #buffer = new AsyncObject(null);

  /**
   * @param {HttpRequest} request
   * @param {RequestReaderOptions} [options]
   */
  constructor(request, options) {
    const o = {
      cache: true,
      ...options,
    };
    if (o.cache !== false) {
      if (cache.has(request)) {
        return cache.get(request);
      }
      cache.set(request, this);
    }
    this.request = request;
  }

  /** @return {Promise<Buffer>} */
  readBuffer() {
    if (this.#buffer.isBusy() || this.#buffer.hasValue()) return this.#buffer.get();
    this.#buffer.prepare();
    const hp = new HeadersParser(this.request.headers);
    let data = Buffer.alloc(Math.min(BUFFER_SIZE, hp.contentLength || BUFFER_SIZE));
    let bytesWritten = 0;
    /** @type {NodeJS.Timeout} */
    let sendPingTimeout = null;
    this.request.data.on('readable', () => {
      let chunk;
      // eslint-disable-next-line no-cond-assign
      while (chunk = this.request.data.read(Math.min(BUFFER_SIZE, this.request.data.readableLength))) {
        /** @type {Buffer} */
        let buffer;
        if (typeof chunk === 'string') {
          console.warn('Unexpected string type on chunk!', this.request.data.readableEncoding);
          buffer = Buffer.from(chunk, this.request.data.readableEncoding);
        } else {
          buffer = chunk;
        }
        if ((buffer.length + bytesWritten) > data.length) {
          let newLength = data.length * 2;
          while (newLength < buffer.length + data.length) {
            newLength *= 2;
          }
          const newBuffer = Buffer.alloc(newLength);
          data.copy(newBuffer);
          data = newBuffer;
        }
        bytesWritten += buffer.copy(data, bytesWritten);
      }
      clearTimeout(sendPingTimeout);
      if (this.request.canPing) {
        sendPingTimeout = setTimeout(() => {
          this.request.ping()
            .then(console.warn)
            .catch(console.error);
        }, STREAM_WAIT_MS);
      }
    });
    this.request.data.on('end', () => {
      clearTimeout(sendPingTimeout);
      if (data.length > bytesWritten) {
        data = data.subarray(0, bytesWritten);
      }
      this.#buffer.set(data);
    });
    this.request.data.on('error', (err) => {
      this.#buffer.reset(err);
    });
    return this.#buffer.get();
  }

  /** @return {Promise<string>} */
  readString() {
    return this.readBuffer().then((buffer) => {
      const hp = new HeadersParser(this.request.headers);
      return buffer.toString(hp.charset);
    });
  }

  /** @return {Promise<Object>} */
  readJSON() {
    return this.readString().then(JSON.parse);
  }
}

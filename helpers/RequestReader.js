/** @typedef {import('../data/custom-types.js').HttpRequest} HttpRequest */

import { TextDecoder } from 'node:util';
import AsyncObject from '../utils/AsyncObject.js';
import RequestHeaders from './RequestHeaders.js';

/**
 * @typedef {Object} RequestReaderOptions
 * @prop {boolean} [cache=true]
 */

const BUFFER_SIZE = 4096;

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
    const hp = new RequestHeaders(this.request);
    let data = Buffer.allocUnsafe(Math.min(BUFFER_SIZE, hp.contentLength || BUFFER_SIZE));
    let bytesWritten = 0;
    this.request.stream.on('readable', () => {
      let chunk;
      // eslint-disable-next-line no-cond-assign
      while (chunk = this.request.stream.read(Math.min(BUFFER_SIZE, this.request.stream.readableLength))) {
        /** @type {Buffer} */
        let buffer;
        if (typeof chunk === 'string') {
          console.warn('Unexpected string type on chunk!', this.request.stream.readableEncoding);
          buffer = Buffer.from(chunk, this.request.stream.readableEncoding);
        } else {
          buffer = chunk;
        }
        if ((buffer.length + bytesWritten) > data.length) {
          let newLength = data.length * 2;
          while (newLength < buffer.length + data.length) {
            newLength *= 2;
          }
          const newBuffer = Buffer.allocUnsafe(newLength);
          data.copy(newBuffer);
          data = newBuffer;
        }
        bytesWritten += buffer.copy(data, bytesWritten);
      }
    });
    this.request.stream.on('end', () => {
      if (data.length > bytesWritten) {
        // Must partition to clear unsafe allocation
        data = data.subarray(0, bytesWritten);
      }
      this.#buffer.set(data);
    });
    this.request.stream.on('error', (error) => {
      this.#buffer.reset(error);
    });
    return this.#buffer.get();
  }

  /** @return {Promise<string>} */
  readString() {
    return this.readBuffer().then((buffer) => {
      const requestHeaders = new RequestHeaders(this.request);
      // TODO: Compare TextDecoder, Buffer.from(), and StringDecoder performance
      const decoder = new TextDecoder(requestHeaders.charset || 'utf-8');
      return decoder.decode(buffer);
    });
  }

  /** @return {Promise<Object<string,any>>} */
  readJSON() {
    return this.readString().then(JSON.parse);
  }

  /**
   * The application/x-www-form-urlencoded format is in many ways an aberrant monstrosity,
   * the result of many years of implementation accidents and compromises leading to a set of
   * requirements necessary for interoperability, but in no way representing good design practices.
   * In particular, readers are cautioned to pay close attention to the twisted details
   * involving repeated (and in some cases nested) conversions between character encodings and byte sequences.
   * Unfortunately the format is in widespread use due to the prevalence of HTML forms. [HTML]
   * @return {Promise<[string, string][]>}
   */
  readUrlEncoded() {
    // https://url.spec.whatwg.org/#urlencoded-parsing
    const requestHeaders = new RequestHeaders(this.request);
    const decoder = new TextDecoder(requestHeaders.charset || 'utf-8');
    return this.readBuffer().then((buffer) => {
      const sequences = [];
      let startIndex = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        if (buffer[index] === 0x26) {
          sequences.push(buffer.subarray(startIndex, index));
          startIndex = index + 1;
        }
        if (index === buffer.length - 1) {
          sequences.push(buffer.subarray(startIndex, index));
        }
      }
      /** @type {[string, string][]} */
      const output = [];
      for (const bytes of sequences) {
        if (!bytes.length) continue;

        // Find 0x3D and replace 0x2B in one loop for better performance
        let indexOf0x3D = -1;
        for (let index = 0; index < bytes.length; index += 1) {
          switch (bytes[index]) {
            case 0x3D:
              if (indexOf0x3D === -1) {
                indexOf0x3D = index;
              }
              break;
            case 0x2B:
              // Replace bytes on original stream for memory conservation
              // eslint-disable-next-line no-param-reassign
              bytes[index] = 0x20;
              break;
            default:
          }
        }
        let name;
        let value;
        if (indexOf0x3D === -1) {
          name = bytes;
          value = bytes.subarray(bytes.length, 0);
        } else {
          name = bytes.subarray(0, indexOf0x3D);
          value = bytes.subarray(indexOf0x3D + 1);
        }
        const nameString = decodeURIComponent(decoder.decode(name));
        const valueString = decodeURIComponent(decoder.decode(value));
        output.push([nameString, valueString]);
      }
      return output;
    });
  }

  /** @return {Promise<Map<string,string>>} */
  readUrlEncodedAsMap() {
    return this.readUrlEncoded().then((tupleArray) => new Map(tupleArray));
  }

  /** @return {Promise<Object<string,string>>} */
  readUrlEncodedAsObject() {
    return this.readUrlEncoded().then((tupleArray) => Object.fromEntries(tupleArray));
  }

  /**
   * Returns `readJSON()`, `readUrlEncodedAsObject`, or `Promise<null>` based on Content-Type
   * @return {Promise<Object<string, any>|null>}
   */
  readObject() {
    const requestHeaders = new RequestHeaders(this.request);
    const mediaType = requestHeaders.mediaType?.toLowerCase() ?? '';
    switch (mediaType) {
      case 'application/json':
        return this.readJSON();
      case 'application/x-www-form-urlencoded':
        return this.readUrlEncodedAsObject();
      default:
        return Promise.resolve(null);
    }
  }

  /**
   * Returns `readJSON()`, `readUrlEncoded`, `readBuffer()`, or `readString()` based on Content-Type
   * @return {Promise<Object<string,any>|string|Buffer>}
   */
  read() {
    const requestHeaders = new RequestHeaders(this.request);
    const mediaType = requestHeaders.mediaType?.toLowerCase() ?? '';
    switch (mediaType) {
      case 'application/json':
        return this.readJSON();
      case 'application/x-www-form-urlencoded':
        return this.readUrlEncoded();
      case 'application/octet-stream':
      case '':
        return this.readBuffer();
      default:
        if (mediaType.startsWith('text')) {
          return this.readString();
        }
        return this.readBuffer();
    }
  }
}

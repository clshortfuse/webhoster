/**
 * @see https://www.rfc-editor.org/rfc/rfc7230
 * @see https://www.rfc-editor.org/rfc/rfc7231
 */

/** @typedef {import('stream').Writable} Writable */

import { PassThrough, pipeline } from 'node:stream';

import { isWritable } from '../utils/stream.js';

/** @typedef {import('http').OutgoingHttpHeaders} OutgoingHttpHeaders */
/** @typedef {import('stream').Stream} Stream */
/** @typedef {import('../types/index.js').Middleware} Middleware */
/** @typedef {import('./HttpRequest.js').default} HttpRequest */
/** @typedef {import('../types/index.js').ResponseFinalizer} ResponseFinalizer */

/**
 * @typedef {Object} HttpResponseOptions
 * @prop {HttpRequest} [request]
 * @prop {OutgoingHttpHeaders} [headers]
 * @prop {function():boolean} [onHeadersSent]
 * @prop {(flush:boolean, end:boolean) => any} [onSendHeaders]
 * @prop {number} [status]
 * @prop {Writable} stream
 * @prop {Stream[]} [pipes]
 * @prop {ResponseFinalizer[]} [finalizers] inline middleware for message body
 * @prop {any} [body]
 */

export default class HttpResponse {
  /** @type {function():boolean} */
  #onHeadersSent = null;

  /** @type {(flush:boolean, end:boolean) => any} */
  #onSendHeaders = null;

  #headersSent = false;

  /** @type {Writable} */
  #pipeline;

  #pipelineComplete = false;

  /** @type {Function[]} */
  #pipelineCallbacks = [];

  #endCalled = false;

  /** @param {HttpResponseOptions} options */
  constructor(options) {
    this.request = options.request;
    /** @type {OutgoingHttpHeaders} */
    this.headers = options.headers ?? {};
    this.isStreaming = false;
    this.stream = options.stream;
    this.pipes = options.pipes ?? [];
    /** @type {ResponseFinalizer[]} */
    this.finalizers = options.finalizers ?? [];
    this.status = options.status;
    /** @type {any} */
    this.body = options.body;
    this.#onHeadersSent = options.onHeadersSent;
    this.#onSendHeaders = options.onSendHeaders;
  }

  get statusCode() {
    return this.status;
  }

  set statusCode(number) {
    this.status = number;
  }

  /**
   * A boolean indicating whether the response was successful (status in the range 200–299) or not.
   * @return {boolean}
   */
  get ok() {
    return this.status >= 200 && this.status <= 299;
  }

  get headersSent() {
    if (this.#headersSent) return true;
    if (!this.#onHeadersSent) return false;
    return this.#onHeadersSent();
  }

  /**
   * @param {boolean} [flush] Flush headers
   * @param {boolean} [end] End stream
   * @return {void}
   */
  sendHeaders(flush, end) {
    if (this.headersSent) {
      throw new Error('HEADER_SENT');
    }
    if (!this.#onSendHeaders) {
      throw new Error('NOT_IMPLEMENTED');
    }
    this.#onSendHeaders(flush, end);
    this.#headersSent = true;
  }

  /**
   * @param {number} [status]
   * @return {Promise<0>} HttpHandler.END
   */
  async sendStatusOnly(status) {
    if (this.headersSent) throw new Error('ERR_HEADER_SENT');
    if (!isWritable(this.stream)) throw new Error('NOT_WRITABLE');
    if (status) {
      this.status = status;
    }
    await this.sendHeaders(true, true);
    return 0;
  }

  /**
   * Send message body to response stream without finalizers
   * @param {any} [body]
   * @return {Promise<0>}
   */
  async sendRaw(body) {
    this.body = body;
    await new Promise((resolve, reject) => {
      this.stream.end(body, (err) => (err ? reject(err) : resolve()));
    });
    return 0;
  }

  /** @return {boolean} */
  hasPipeline() {
    return this.#pipeline != null;
  }

  /**
   * @param {Transform} stream
   * @return {this}
   */
  addUpstream(stream) {
    this.pipes.push(stream);
    return this;
  }

  /**
   * @param {(err: NodeJS.ErrnoException | null) => void} [callback] pipeline completion
   * @return {Writable}
   */
  getPipeline(callback) {
    if (callback) {
      if (this.#pipelineComplete) {
        setTimeout(callback, 0);
      } else {
        this.#pipelineCallbacks.push(callback);
      }
    }

    if (this.#pipeline) return this.#pipeline;

    if (!this.isStreaming) {
      // Called directly by user and needs finalizer calls

      this.isStreaming = true;
      for (let i = 0; i < this.finalizers.length; i++) {
        const process = this.finalizers[i];
        const result = process(this);
        if (result === false) {
          break;
        }
      }
    }
    let array;
    if (this.pipes.length) {
      array = [
        ...this.pipes,
        this.stream,
      ];
    } else {
      array = [
        new PassThrough({ objectMode: true }),
        this.stream,
      ];
    }

    this.#pipeline = array[0];
    // @ts-ignore Bad typings
    pipeline(array, (err) => {
      this.#pipelineComplete = true;
      let nextCallback;
      while ((nextCallback = this.#pipelineCallbacks.shift()) != null) {
        nextCallback(err);
      }
    });
    return this.#pipeline;
  }

  /**
   * Asynchronously sends message body
   * Returns on completions
   * @throws {Error}
   * @param {any} [body]
   * @return {Promise<0>} HttpHandler.END
   */
  async send(body) {
    if (!isWritable(this.stream)) throw new Error('NOT_WRITABLE');
    if (this.isStreaming) throw new Error('ALREADY STREAMING');

    if (body !== undefined) {
      this.body = body;
    }
    if (typeof this.body === 'object' && this.body !== null
      && (Symbol.asyncIterator in this.body)) {
      this.isStreaming = true;
      this.pipes.push(this.body);
    }

    for (const process of this.finalizers) {
      const result = process(this);
      if (result === true || result == null) {
        continue;
      }
      if (result === false) {
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      const promiseResult = await result;
      if (promiseResult === true || result == null) {
        continue;
      }
      if (promiseResult === false) {
        break;
      }
    }
    if (!isWritable(this.stream)) return 0;
    if (this.isStreaming) {
      await new Promise((resolve, reject) => {
        this.getPipeline((err) => {
          if (err) reject(err);
          resolve();
        });
      });
    } else {
      if (!this.headersSent) this.sendHeaders();
      await this.sendRaw(this.body);
    }
    return 0;
  }

  wasEndCalled() {
    return this.#endCalled;
  }

  /**
   * Synchronously ends stream with message body. Ignores errors
   * @param {any} [body]
   * @return {0} HttpHandler.END
   */
  end(body) {
    this.#endCalled = true;
    if (!isWritable(this.stream)) {
      return 0;
    }
    if (this.isStreaming) {
      throw new Error('ALREADY STREAMING');
    }

    if (body !== undefined) {
      this.body = body;
    }

    if (typeof this.body === 'object' && this.body !== null
      && (Symbol.asyncIterator in this.body)) {
      this.isStreaming = true;
      this.pipes.push(this.body);
    }

    // Process
    /** @type {ResponseFinalizer[]} */
    const pendingProcessors = [];
    let needsAsync = false;
    /** @type {void|Promise<boolean|void>} */
    let pendingPromise;
    let i;
    for (i = 0; i < this.finalizers.length; i++) {
      const process = this.finalizers[i];
      if (needsAsync) {
        pendingProcessors.push(process);
        continue;
      }

      const result = process(this);
      if (result === true || result == null) {
        continue;
      }
      if (result === false) {
        break;
      }
      pendingPromise = result;
      needsAsync = true;
      continue;
    }
    if (pendingPromise) {
      pendingPromise.then(async (initialResult) => {
        if (initialResult !== false) {
          for (i = 0; i < pendingProcessors.length; i++) {
            const process = pendingProcessors[i];
            const result = process(this);
            if (result === true || result == null) {
              continue;
            }
            if (result === false) {
              break;
            }
            // eslint-disable-next-line no-await-in-loop
            const promiseResult = await result;
            if (promiseResult === true || result == null) {
              continue;
            }
            if (promiseResult === false) {
              break;
            }
          }
        }

        if (this.isStreaming) {
          this.getPipeline();
        } else {
          if (!this.headersSent) this.sendHeaders();
          if (this.body == null) {
            this.stream.end();
          } else {
            this.stream.end(this.body);
          }
        }
      }).catch((error) => {
        // console.error(error);
        this.stream.destroy(error);
      });
      return 0;
    }

    if (this.isStreaming) {
      this.getPipeline();
    } else {
      if (!this.headersSent) this.sendHeaders();
      if (this.body == null) {
        this.stream.end();
      } else {
        this.stream.end(this.body);
      }
    }
    return 0;
  }

  // Alias

  /**
   * @param {number} status
   * @return {this}
   */
  code(status) {
    this.status = status;
    return this;
  }

  /**
   * @param {number} status
   * @throws {Error<ERR_HEADER_SENT>}
   * @return {this}
   */
  setStatus(status) {
    if (this.headersSent) throw new Error('ERR_HEADER_SENT');
    this.status = status;
    return this;
  }
}

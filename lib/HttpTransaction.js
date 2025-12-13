/** @typedef {import('./HttpRequest.js').default} HttpRequest */
/** @typedef {import('./HttpResponse.js').default} HttpResponse */
/** @typedef {import('stream').Stream} Stream */

/** @typedef {import('../data/custom-types.js').MediaType} MediaType */
/** @typedef {import('../data/custom-types.js').Middleware} Middleware */
/** @typedef {import('stream').Writable} Writable */

/** @typedef {Partial<MediaType> & {parse:(this:HttpRequest)=>any|PromiseLike<any>, test?:(this:HttpRequest, mediaType: MediaType)=>boolean}} ContentReaderRegistration */

/**
 * @typedef {Object} PathHistoryEntry
 * @prop {string} base
 * @prop {number[]} treeIndex
 */

/**
 * @typedef {Object} PathState
 * @prop {PathHistoryEntry[]} history
 * @prop {string} currentPath
 */

/**
 * @typedef {Object} HttpTransactionState
 * @prop {number[]} treeIndex Middleware level
 * @prop {PathState} path
 */

/**
 * @template {Object<string,any>} T
 * @typedef HttpTransactionOptions
 * @prop {string} httpVersion
 * @prop {HttpRequest} [request]
 * @prop {HttpResponse} [response]
 * @prop {import('net').Socket|import('tls').TLSSocket} socket
 * @prop {boolean} [canPing]
 * @prop {(function():Promise<any>)|(function():any)} [onPing]
 * @prop {boolean|function():boolean} [canPushPath]
 * @prop {(path:string) => Promise<any>} [onPushPath]
 * @prop {function():boolean} [onHeadersSent]
 * @prop {(flush:boolean, end:boolean) => boolean} [onSendHeaders]
 * @prop {T} [locals]
 * @prop {HttpTransactionState} [state]
 * @prop {Error} [error]
 */

/**
 * @template {Object<string,any>} [T=any]
 */
export default class HttpTransaction {
  /** @type {boolean|(()=>boolean)} */
  #canPing = false;

  /** @type {function():Promise<any>} */
  #onPing = null;

  /** @type {(path:string) => Promise<any>} */
  #onPushPath = null;

  /** @type {Array<string>} */
  #pushedPaths = [];

  /** @type {boolean|(()=>boolean)} */
  #canPushPath = false;

  #isErrorHandlerState = false;

  /** @param {HttpTransactionOptions<T>} options */
  constructor(options) {
    this.request = options.request;
    this.response = options.response;

    /** @type {T} */
    this.locals = options.locals || /** @type {T} */ ({});
    this.state = options.state || {
      treeIndex: [],
      path: null,
    };

    this.socket = options.socket;
    this.httpVersion = options.httpVersion;

    this.#canPing = options.canPing ?? false;
    this.#onPing = options.onPing;

    this.#onPushPath = options.onPushPath;
    this.#canPushPath = options.canPushPath ?? false;

    this.error = options.error;
  }

  setErrorHandlerState() {
    this.#isErrorHandlerState = true;
  }

  isErrorHandlerState() {
    return this.#isErrorHandlerState;
  }

  get canPing() {
    if (!this.#canPing) return false;
    if (this.#canPing === true) return true;
    return this.#canPing();
  }

  /**
   * @return {Promise<any>}
   */
  ping() {
    if (!this.#canPing) {
      return Promise.reject(new Error('NOT_SUPPORTED'));
    }
    if (!this.#onPing) {
      return Promise.reject(new Error('NOT_IMPLEMENTED'));
    }
    return this.#onPing();
  }

  get pushedPaths() {
    return this.#pushedPaths;
  }

  get canPushPath() {
    if (!this.#canPushPath) return false;
    if (this.#canPushPath === true) return true;
    return this.#canPushPath();
  }

  /**
   * @param {string} [path]
   * @return {Promise<any>}
   */
  async pushPath(path) {
    if (this.#pushedPaths.includes(path)) {
      throw new Error('ALREADY_PUSHED');
    }
    if (!this.#canPushPath) {
      throw new Error('NOT_SUPPORTED');
    }
    if (!this.#onPushPath) {
      throw new Error('NOT_IMPLEMENTED');
    }
    await this.#onPushPath(path);
    this.#pushedPaths.push(path);
  }
}

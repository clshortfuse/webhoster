/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareResponseFunction} MiddlewareResponseFunction */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types/index.js').ResponseFinalizer} ResponseFinalizer */

/**
 * @typedef {Object} SendJsonMiddlewareOptions
 * @prop {string} [defaultCharset='utf-8']
 * @prop {boolean} [setCharset=true]
 * Automatically applies charset in `Content-Type`
 * @prop {boolean} [setMediaType=true]
 * Automatically applies `application/json` mediatype in `Content-Type`
 */

/* eslint-disable unicorn/text-encoding-identifier-case */

export default class SendJsonMiddleware {
  /** @type {SendJsonMiddleware} */
  static #defaultInstance;

  /**
   * @param {string} charset
   * @return {BufferEncoding}
   */
  static charsetAsBufferEncoding(charset) {
    switch (charset) {
      case 'iso-8859-1':
      case 'ascii':
      case 'binary':
      case 'latin1':
        return 'latin1';
      case 'utf-16le':
      case 'ucs-2':
      case 'ucs2':
      case 'utf16le':
        return 'utf16le';
      case 'base64':
      case 'hex':
        return /** @type {BufferEncoding} */ (charset);
      case 'utf-8':
      case 'utf8':
      default:
        return 'utf-8';
    }
  }

  /** @type {MiddlewareResponseFunction} */
  static Execute({ response }) {
    if (!SendJsonMiddleware.#defaultInstance) {
      SendJsonMiddleware.#defaultInstance = new SendJsonMiddleware({
        defaultCharset: 'utf-8',
        setCharset: true,
        setMediaType: true,
      });
    }
    response.finalizers.push(SendJsonMiddleware.#defaultInstance.finalizeResponse);
  }

  /** @param {SendJsonMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.options = {
      defaultCharset: options.defaultCharset || 'utf-8',
      setCharset: options.setCharset !== false,
      setMediaType: options.setMediaType !== false,
    };
    // Single shared function instead of one per response
    this.finalizeResponse = this.finalizeResponse.bind(this);
  }

  /** @type {ResponseFinalizer} */
  finalizeResponse(response) {
    if (response.isStreaming
      || response.body == null
      || typeof response.body !== 'object'
      || Buffer.isBuffer(response.body)) return;

    // TODO: Check response.request.headers.accepts

    let charset;
    const contentType = /** @type {string} */ (response.headers['content-type']);
    if (contentType) {
      const newDirectives = [];
      for (const directive of contentType.split(';')) {
        const [key, value] = directive.split('=');
        if (key?.trim().toLowerCase() !== 'charset') {
          newDirectives.push(directive);
          continue;
        }
        charset = value?.trim().toLowerCase();
        const firstQuote = charset.indexOf('"');
        const lastQuote = charset.lastIndexOf('"');
        if (firstQuote !== -1 && lastQuote !== -1) {
          charset = charset.slice(firstQuote + 1, lastQuote);
        }
        break;
      }

      if (!charset) {
        charset = this.options.defaultCharset;
      }

      if (this.options.setCharset && !response.headersSent) {
        newDirectives.push(`charset=${charset}`);
        response.headers['content-type'] = newDirectives.join(';');
      }
    } else if (this.options.setMediaType) {
      charset = this.options.defaultCharset;
      if (!response.headersSent) {
        response.headers['content-type'] = this.options.setCharset
          ? `application/json;charset=${charset}`
          : 'application/json';
      }
    } else if (this.options.setCharset) {
      charset = this.options.defaultCharset;
      if (!response.headersSent) {
        response.headers['content-type'] = `;charset=${charset}`;
      }
    } else {
      // noop?
    }

    const stringData = JSON.stringify(response.body);
    const bufferEncoding = SendJsonMiddleware.charsetAsBufferEncoding(charset);
    response.body = Buffer.from(stringData, bufferEncoding);
  }

  /** @type {MiddlewareResponseFunction} */
  execute({ response }) {
    response.finalizers.push(this.finalizeResponse);
  }
}

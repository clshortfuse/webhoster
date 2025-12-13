/** @typedef {import('../data/custom-types.js').IMiddleware} IMiddleware */
/** @typedef {import('../data/custom-types.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../data/custom-types.js').ResponseFinalizer} ResponseFinalizer */

/**
 * @typedef {Object} SendStringMiddlewareOptions
 * @prop {string} [defaultCharset='utf-8']
 * @prop {boolean} [setCharset=true]
 * Automatically applies charset in `Content-Type`
 */

export default class SendStringMiddleware {
  /** @param {SendStringMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.options = {
      defaultCharset: options.defaultCharset || 'utf-8',
      setCharset: options.setCharset !== false,
    };
    // Single shared function instead of one per response
    this.finalizeResponse = this.finalizeResponse.bind(this);
  }

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

  /** @type {ResponseFinalizer} */
  finalizeResponse(response) {
    if (response.isStreaming || typeof response.body !== 'string') return true;
    let charset;
    let contentType = /** @type {string} */ (response.headers['content-type']);
    if (contentType) {
      contentType.split(';').some((directive) => {
        const parameters = directive.split('=');
        if (parameters[0].trim().toLowerCase() !== 'charset') {
          return false;
        }
        charset = parameters[1]?.trim().toLowerCase();
        const firstQuote = charset.indexOf('"');
        const lastQuote = charset.lastIndexOf('"');
        if (firstQuote !== -1 && lastQuote !== -1) {
          charset = charset.slice(firstQuote + 1, lastQuote);
        }
        return true;
      });
    } else {
      contentType = '';
    }
    if (!charset) {
      charset = this.options.defaultCharset || 'utf-8';
      if (this.options.setCharset && !response.headersSent) {
        response.headers['content-type'] = `${contentType || ''};charset=${charset}`;
      }
    }

    const bufferEncoding = SendStringMiddleware.charsetAsBufferEncoding(charset);
    response.body = Buffer.from(response.body, bufferEncoding);
    return true;
  }

  /** @type {MiddlewareFunction} */
  execute({ response }) {
    response.finalizers.push(this.finalizeResponse);
  }
}

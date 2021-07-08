import { Transform } from 'stream';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} ContentWriterMiddlewareOptions
 * @prop {string} [defaultCharset='utf-8']
 * @prop {boolean} [setCharset=false]
 * Automatically applies charset in `Content-Type`
 * @prop {boolean} [setJSON=false]
 * Automatically applies `application/json` mediatype in `Content-Type`
 * @prop {boolean|string} [cache=false]
 * Caches content in res.local.content or res.local[cacheName]
 */

/** @implements {IMiddleware} */
export default class ContentWriterMiddleware {
  /** @param {ContentWriterMiddlewareOptions} [options] */
  constructor(options = {}) {
    this.defaultCharset = options.defaultCharset || 'utf-8';
    this.setCharset = options.setCharset === true;
    this.setJSON = options.setJSON === true;
    this.cache = options.cache;
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
      default:
      case 'utf-8':
      case 'utf8':
        return 'utf-8';
      case 'base64':
      case 'hex':
        return /** @type {BufferEncoding} */ (charset);
    }
  }

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ req, res }) {
    if (req.method === 'HEAD') {
      return 'continue';
    }

    /** @type {string} */
    let charset = null;
    /** @type {BufferEncoding} */
    let encoding = null;
    let hasSetJSON = false;

    /** @return {string} */
    const parseCharset = () => {
      if (charset) return charset;
      /** @type {string} */
      const contentType = (res.headers['content-type']);
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
            charset = charset.substring(firstQuote + 1, lastQuote);
          }
          return true;
        });
      }
      if (!charset) {
        charset = this.defaultCharset || 'utf-8';
        if (this.setCharset && !res.headersSent) {
          res.headers['content-type'] = `${contentType || ''};charset=${charset}`;
        }
      }
      return charset;
    };

    /** @return {void} */
    const setJSONMediaType = () => {
      if (hasSetJSON) return;
      /** @type {string} */
      const contentType = (res.headers['content-type']);
      res.headers['content-type'] = (contentType || '')
        .split(';')
        .map((directive) => {
          const isKeyPair = directive.includes('=');
          if (isKeyPair) return directive;
          return 'application/json';
        })
        .join(';');

      hasSetJSON = true;
    };

    const newWritable = new Transform({
      writableObjectMode: true,
      transform: (chunk, e, callback) => {
        console.log('ContentWriterMiddleware:', 'transform', chunk.length);
        if (Buffer.isBuffer(chunk)) {
          console.log('Calling back with buffer');
          callback(null, chunk);
          return;
        }
        const cacheName = this.cache && (this.cache === true ? 'content' : this.cache);
        if (typeof chunk === 'string') {
          if (!encoding) {
            encoding = ContentWriterMiddleware.charsetAsBufferEncoding(parseCharset());
          }
          if (cacheName) {
            if (typeof res.locals[cacheName] === 'string') {
              res.locals[cacheName] += chunk;
            } else {
              res.locals[cacheName] = chunk;
            }
          }
          console.log('Calling back with string');
          const callbackData = Buffer.from(chunk, encoding);
          console.log(callbackData);
          callback(null, callbackData);
          return;
        }
        if (cacheName) {
          res.locals[cacheName] = chunk;
        }
        if (typeof chunk === 'object') {
          if (!encoding) {
            encoding = ContentWriterMiddleware.charsetAsBufferEncoding(parseCharset());
          }
          if (this.setJSON && !hasSetJSON && !res.headersSent) {
            setJSONMediaType();
          }
          console.log('calling back with JSON');
          callback(null, Buffer.from(JSON.stringify(chunk), encoding));
          return;
        }

        console.log('calling back with string?');
        callback(null, chunk);
      },
    });
    const destination = res.replaceStream(newWritable);
    newWritable.pipe(destination);

    return 'continue';
  }
}

import CookieObject from '../data/CookieObject.js';

import HeadersHandler from './HeadersParser.js';

/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */
/** @typedef {import('../types').CookieDetails} CookieDetails */

/** @type {(keyof CookieDetails)[]} */
const COOKIE_DETAIL_KEYS = [
  'name',
  'value',
  'expires',
  'maxAge',
  'domain',
  'path',
  'secure',
  'httpOnly',
  'sameSite',
];

/** @type {WeakMap<HttpResponse, ResponseHeaders>} */
const instanceCache = new WeakMap();

export default class ResponseHeaders extends HeadersHandler {
  /** @param {HttpResponse} res */
  // @ts-ignore Cached constructor
  constructor(res) {
    const instance = instanceCache.get(res);
    if (instance) return instance;
    super(res.headers);
    instanceCache.set(res, this);
  }

  /** @param {HttpResponse} res */
  static cookies(res) {
    const instance = new ResponseHeaders(res);
    return instance.cookies;
  }

  /** @type {CookieObject[]} */
  #setCookiesProxy = null;

  /** @type {ProxyHandler<CookieObject>} */
  #cookieObjectProxyHandler = {
    set: (cookieTarget, cookieProperty, cookieValue, receiver) => {
      Reflect.set(cookieTarget, cookieProperty, cookieValue, receiver);
      const index = this.cookieEntries.findIndex((entry) => entry.toString() === cookieTarget.toString());
      if (index !== -1) {
        // Force reflection
        Reflect.set(this.cookieEntries, index, cookieTarget);
      }
      return true;
    },
  };

  get contentType() {
    return super.contentType;
  }

  /** @param {string} contentType */
  set contentType(contentType) {
    this.headers['content-type'] = contentType;
  }

  get mediaType() {
    return super.mediaType;
  }

  /** @param {string} mediaType */
  set mediaType(mediaType) {
    const { charset, boundary } = this;
    this.contentType = [
      mediaType ?? '',
      charset ? `charset=${charset}` : null,
      boundary ? `boundary=${boundary}` : null,
    ].filter((s) => s != null).join(';');
  }

  get charset() {
    return super.charset;
  }

  /** @param {string} charset */
  set charset(charset) {
    const { mediaType, boundary } = this;
    this.contentType = [
      mediaType ?? '',
      charset ? `charset=${charset}` : null,
      boundary ? `boundary=${boundary}` : null,
    ].filter((s) => s != null).join(';');
  }

  /** @return {BufferEncoding} */
  get charsetAsBufferEncoding() {
    const { charset } = this;
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
      case 'utf-8':
      case 'utf8':
        return 'utf-8';
      case 'base64':
      case 'hex':
      default:
        return /** @type {BufferEncoding} */ (charset);
    }
  }

  /** @param {BufferEncoding} bufferEncoding */
  set charsetAsBufferEncoding(bufferEncoding) {
    switch (bufferEncoding) {
      case 'ascii':
      case 'binary':
      case 'latin1':
        this.charset = 'iso-8859-1';
        break;
      case 'ucs-2':
      case 'ucs2':
      case 'utf16le':
        this.charset = 'utf-16le';
        break;
      case 'utf-8':
      case 'utf8':
        this.charset = 'utf-8';
        break;
      case 'base64':
      case 'hex':
      default:
        this.charset = bufferEncoding;
    }
  }

  get boundary() {
    return super.boundary;
  }

  /** @param {string} boundary */
  set boundary(boundary) {
    const { mediaType, charset } = this;
    this.contentType = [
      mediaType ?? '',
      charset ? `charset=${charset}` : null,
      boundary ? `boundary=${boundary}` : null,
    ].filter((s) => s != null).join(';');
  }

  get contentLength() {
    return super.contentLength;
  }

  /** @param {number} value */
  set contentLength(value) {
    this.headers['content-length'] = value;
  }

  get cookies() {
    // eslint-disable-next-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias
    const instance = this;
    return {
      /**
       * @param {string|CookieDetails|CookieObject} nameOrDetails
       * @return {boolean}
       */
      has(nameOrDetails) {
        return !!this.getAll(nameOrDetails)[0];
      },
      /**
       * @param {string|CookieDetails} partial
       * @return {CookieObject}
       */
      get(partial) {
        return this.getAll(partial)[0];
      },
      /**
       * @param {string|CookieDetails} [partial]
       * @return {CookieObject[]}
       */
      getAll(partial) {
        const details = typeof partial === 'string' ? new CookieObject({ name: partial }) : partial ?? {};
        /** @type {CookieDetails} */
        const searchDetails = { name: details.name };
        if (details.path) {
          searchDetails.path = details.path;
        }
        return this.findAll(searchDetails);
      },
      /**
       * @param {CookieDetails} details
       * @return {CookieObject}
       */
      find(details) {
        return this.findAll(details)[0];
      },
      /**
       * @param {CookieDetails} [details]
       * @return {CookieObject[]}
       */
      findAll: (details = {}) => this.cookieEntries
        .filter((cookieObject) => COOKIE_DETAIL_KEYS.every((key) => {
          if ((key in details) === false) {
            return true;
          }
          switch (key) {
            case 'expires':
              return details.expires?.getTime() === cookieObject.expires?.getTime();
            case 'path':
              return (details.path ?? '') === (cookieObject.path ?? '');
            default:
              return details[key] === cookieObject[key];
          }
        }))
        .sort((a, b) => ((b?.path?.length ?? 0) - (a?.path?.length ?? 0))),
      /**
       * @param {string|CookieDetails} cookie
       * @return {CookieObject}
       */
      set(cookie) {
        const details = typeof cookie === 'string' ? new CookieObject(cookie) : cookie ?? {};
        let cookieObject = this.find({
          path: '',
          ...details,
        });
        if (cookieObject) {
          for (const key of COOKIE_DETAIL_KEYS) {
            // @ts-expect-error Coerce
            cookieObject[key] = details[key];
          }
        } else {
          cookieObject = new Proxy(new CookieObject(details), instance.#cookieObjectProxyHandler);
          instance.cookieEntries.push(cookieObject);
        }
        return cookieObject;
      },
      /**
       * @param {string|CookieDetails} partial
       * @return {number} count
       */
      remove(partial) {
        const items = this.getAll(partial);
        const count = items.length;
        for (const item of items) {
          instance.cookieEntries.splice(instance.cookieEntries.indexOf(item), 1);
        }
        return count;
      },
      /**
       * @param {string|CookieDetails} partial name or details
       * @return {CookieObject}
       */
      expire(partial) {
        const details = typeof partial === 'string' ? new CookieObject({ name: partial }) : partial ?? {};
        let object = this.get(details);
        if (!object) {
          object = new Proxy(new CookieObject(details), instance.#cookieObjectProxyHandler);
          instance.cookieEntries.push(object);
        }
        delete object.expires;
        object.maxAge = 0;
        object.value = '';
        return object;
      },
      /**
       * @param {string|CookieDetails} [partial]
       * @return {CookieObject[]}
       */
      expireAll(partial) {
        const items = this.getAll(partial);
        for (const item of items) {
          item.expires = null;
          item.maxAge = 0;
          item.value = '';
        }
        return items;
      },
    };
  }

  /** @return {Array<CookieObject>} */
  get cookieEntries() {
    if (!this.#setCookiesProxy) {
      if (!this.headers['set-cookie']) {
        this.headers['set-cookie'] = [];
      }
      /** @type {CookieObject[]} */
      const values = this.headers['set-cookie']
        .map((/** @type {string} */ setCookie) => new Proxy(
          new CookieObject(setCookie),
          this.#cookieObjectProxyHandler,
        ));
      this.#setCookiesProxy = new Proxy(values, {
        get: (arrayTarget, arrayProperty, receiver) => {
          if (typeof arrayProperty !== 'string') {
            return Reflect.get(arrayTarget, arrayProperty, receiver);
          }
          if (arrayProperty === 'length') {
            return this.headers['set-cookie'].length;
          }
          if (Number.isNaN(Number.parseInt(arrayProperty, 10))) {
            return Reflect.get(arrayTarget, arrayProperty, receiver);
          }
          const entry = this.headers['set-cookie'][arrayProperty];
          if (entry === undefined) {
            return entry;
          }
          if (arrayProperty in arrayTarget === false) {
            Reflect.set(
              arrayTarget,
              arrayProperty,
              new Proxy(new CookieObject(entry), this.#cookieObjectProxyHandler),
            );
          }
          return Reflect.get(arrayTarget, arrayProperty, receiver);
        },
        set: (arrayTarget, arrayProperty, value, receiver) => {
          Reflect.set(arrayTarget, arrayProperty, value, receiver);
          if (typeof arrayProperty !== 'string') return true;
          if (arrayProperty === 'length') {
            Reflect.set(this.headers['set-cookie'], arrayProperty, value);
          }
          if (value instanceof CookieObject) {
            this.headers['set-cookie'][arrayProperty] = value.toString();
          }
          return true;
        },
      });
    }
    return this.#setCookiesProxy;
  }
}

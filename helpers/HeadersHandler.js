import CookieObject from './CookieObject.js';

/**
 * @param {string} cookieString
 * @return {[string,string][]}
 */
function getEntriesFromCookie(cookieString) {
  const split = cookieString.split(';');
  /** @type {[string,string][]} */
  const entries = [];
  for (let i = 0; i < split.length; i += 1) {
    const [key, value] = split[i].split('=');
    const trimmed = key.trim();
    entries.push([trimmed, value]);
  }
  return entries;
}

export default class HeadersHandler {
  /** @type {Object<string,string[]>} */
  #cookiesProxy = null;

  /** @type {CookieObject[]} */
  #setCookiesProxy = null;

  constructor(headers = {}) {
    /** @type {Object<string,any>} */
    this.headers = headers;
  }

  /** @return {string} */
  get contentType() {
    return this.headers['content-type'];
  }

  set contentType(value) {
    this.headers['content-type'] = value;
  }

  /**
   * The `media-type` directive of `Content-Type`.
   * The MIME type of the resource or the data.
   * (Always lowercase)
   * @return {string}
   */
  get mediaType() {
    return this.contentType?.split(';')[0].trim().toLowerCase();
  }

  /**
   * The `charset` direct of `Content-Type`.
   * The character encoding standard.
   * (Always lowercase)
   * @return {string} */
  get charset() {
    let value = null;
    // eslint-disable-next-line no-unused-expressions
    this.contentType?.split(';').some((directive) => {
      const parameters = directive.split('=');
      if (parameters[0].trim().toLowerCase() !== 'boundary') {
        return false;
      }
      value = parameters[1]?.trim().toLowerCase();
      const firstQuote = value.indexOf('"');
      const lastQuote = value.lastIndexOf('"');
      if (firstQuote !== -1 && lastQuote !== -1) {
        value = value.substring(firstQuote + 1, lastQuote);
      }
      return true;
    });
    return value;
  }

  /** @return {string} */
  get boundary() {
    let value = null;
    // eslint-disable-next-line no-unused-expressions
    this.contentType?.split(';').some((directive) => {
      const parameters = directive.split('=');
      if (parameters[0].trim().toLowerCase() !== 'boundary') {
        return false;
      }
      value = parameters[1]?.trim().toLowerCase();
      const firstQuote = value.indexOf('"');
      const lastQuote = value.lastIndexOf('"');
      if (firstQuote !== -1 && lastQuote !== -1) {
        value = value.substring(firstQuote + 1, lastQuote);
      }
      return true;
    });
    return value;
  }

  /** @return {string} */
  set mediaType(mediaType) {
    const { charset, boundary } = this;
    this.contentType = [
      mediaType ?? '',
      charset ? `charset=${charset}` : null,
      boundary ? `boundary=${boundary}` : null,
    ].filter((s) => s != null).join(';');
  }

  set charset(charset) {
    const { mediaType, boundary } = this;
    this.contentType = [
      mediaType ?? '',
      charset ? `charset=${charset}` : null,
      boundary ? `boundary=${boundary}` : null,
    ].filter((s) => s != null).join(';');
  }

  set boundary(boundary) {
    const { mediaType, charset } = this;
    this.contentType = [
      mediaType ?? '',
      charset ? `charset=${charset}` : null,
      boundary ? `boundary=${boundary}` : null,
    ].filter((s) => s != null).join(';');
  }

  /**
   * @param {number} value
   */
  set contentLength(value) {
    this.headers['content-length'] = value.toString();
  }

  /** @return {number} */
  get contentLength() {
    return parseInt(this.headers['content-length'], 10) || null;
  }

  /** @return {Object<string,string[]>} */
  get cookies() {
    if (!this.#cookiesProxy) {
      const instance = this;
      /** @type {Map<string,string[]>} */
      const arrayProxyMap = new Map();
      this.#cookiesProxy = new Proxy({}, {
        get(cookieTarget, cookieName) {
          if (typeof cookieName !== 'string') return undefined;
          if (arrayProxyMap.has(cookieName)) {
            return arrayProxyMap.get(cookieName);
          }
          const cookieString = (instance.headers.cookie ?? '');
          const split = cookieString.split(';');
          const values = [];
          for (let i = 0; i < split.length; i += 1) {
            const [key, value] = split[i].split('=');
            if (key.trim() === cookieName) values.push(value);
          }
          const arrayProxy = new Proxy(values, {
            get: (arrayTarget, arrayProp, receiver) => {
              if (typeof arrayProp !== 'string') {
                return Reflect.get(arrayTarget, arrayProp, receiver);
              }
              if (arrayProp === 'length') {
                return getEntriesFromCookie(instance.headers.cookie ?? '')
                  .filter(([key]) => (key === cookieName)).length;
              }
              if (Number.isNaN(parseInt(arrayProp, 10))) {
                return Reflect.get(arrayTarget, arrayProp, receiver);
              }
              const entries = getEntriesFromCookie(instance.headers.cookie ?? '');
              let count = 0;
              for (let i = 0; i < entries.length; i += 1) {
                const entry = entries[i];
                if (entry[0] === cookieName) {
                  if (arrayProp === count.toString()) {
                    return entry[1];
                  }
                  count += 1;
                }
              }
              return Reflect.get(arrayTarget, arrayProp, receiver);
            },
            set: (arrayTarget, arrayProp, value, receiver) => {
              Reflect.set(arrayTarget, arrayProp, value, receiver);
              if (typeof arrayProp !== 'string') return true;
              const result = getEntriesFromCookie(instance.headers.cookie ?? '').reduce((prev, curr) => {
                if (!curr[0]) return prev;
                if (curr[0] === cookieName) return prev;
                return `${prev};${curr[0]}=${curr[1]}`;
              }, arrayTarget.map((v) => `${cookieName}=${v}`).join(';'));
              instance.headers.cookie = result;
              return true;
            },
          });
          arrayProxyMap.set(cookieName, arrayProxy);
          return arrayProxy;
        },
        ownKeys() {
          const cookieString = (instance.headers.cookie || '');
          const split = cookieString.split(';');
          /** @type {string[]} */
          const keys = [];
          for (let i = 0; i < split.length; i += 1) {
            const [key] = split[i].split('=');
            const trimmed = key?.trim();
            if (trimmed && !keys.includes(trimmed)) {
              keys.push(trimmed);
            }
          }
          return keys;
        },
        has(target, p) {
          return instance.headers.cookie?.split(';')
            .some((/** @type string */ cookie) => cookie.split('=')[0]?.trim() === p) ?? false;
        },
        getOwnPropertyDescriptor() {
          return {
            enumerable: true,
            configurable: true,
          };
        },
      });
    }
    return this.#cookiesProxy;
  }

  /** @return {Array<CookieObject>} */
  get setCookies() {
    if (!this.#setCookiesProxy) {
      if (!this.headers['set-cookie']) {
        this.headers['set-cookie'] = [];
      }
      const instance = this;
      /** @type {ProxyHandler<CookieObject>} */
      const CookieObjectProxyHandler = {
        set: (cookieTarget, cookieProp, cookieValue, receiver) => {
          Reflect.set(cookieTarget, cookieProp, cookieValue, receiver);
          const index = this.#setCookiesProxy.indexOf(cookieTarget);
          if (index !== -1) {
            // Force reflection
            Reflect.set(this.#setCookiesProxy, index, cookieTarget);
          }
          return true;
        },
      };
      /** @type {CookieObject[]} */
      const values = instance.headers['set-cookie']
        .map((/** @type {string} */ setCookie) => new Proxy(new CookieObject(setCookie), CookieObjectProxyHandler));
      this.#setCookiesProxy = new Proxy(values, {
        get: (arrayTarget, arrayProp, receiver) => {
          if (typeof arrayProp === 'string') {
            return Reflect.get(arrayTarget, arrayProp, receiver);
          }
          if (arrayProp === 'length') {
            return instance.headers['set-cookie'].length;
          }
          if (Number.isNaN(parseInt(arrayProp, 10))) {
            return Reflect.get(arrayTarget, arrayProp, receiver);
          }
          const entry = instance.headers['set-cookie'][arrayProp];
          if (typeof entry === 'undefined') {
            return entry;
          }
          if (!arrayTarget[arrayProp]) {
            arrayTarget[arrayProp] = new Proxy(new CookieObject(entry), CookieObjectProxyHandler);
          }
          return Reflect.get(arrayTarget, arrayProp, receiver);
        },
        set: (arrayTarget, arrayProp, value, receiver) => {
          Reflect.set(arrayTarget, arrayProp, value, receiver);
          if (typeof arrayProp !== 'string') return true;
          if (value instanceof CookieObject) {
            instance.headers['set-cookie'][arrayProp] = value.toString();
          }
          return true;
        },
      });
    }
    return this.#setCookiesProxy;
  }
}

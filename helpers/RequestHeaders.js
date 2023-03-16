import HeadersHandler from './HeadersParser.js';

/** @typedef {import('../lib/HttpRequest.js').default} HttpRequest */

/**
 * @param {string} cookieString
 * @return {[string,string][]}
 */
function getEntriesFromCookie(cookieString) {
  return cookieString.split(';').map((pair) => {
    const indexOfEquals = pair.indexOf('=');
    let name;
    let value;
    if (indexOfEquals === -1) {
      name = '';
      value = pair.trim();
    } else {
      name = pair.slice(0, indexOfEquals).trim();
      value = pair.slice(indexOfEquals + 1).trim();
    }
    const firstQuote = value.indexOf('"');
    const lastQuote = value.lastIndexOf('"');
    if (firstQuote !== -1 && lastQuote !== -1) {
      value = value.slice(firstQuote + 1, lastQuote);
    }
    return [name, value];
  });
}

/** @type {WeakMap<HttpRequest, RequestHeaders>} */
const instanceCache = new WeakMap();

export default class RequestHeaders extends HeadersHandler {
  /** @param {HttpRequest} req */
  // @ts-ignore Use cache
  constructor(req) {
    const instance = instanceCache.get(req);
    if (instance) return instance;
    super(req.headers);
    instanceCache.set(req, this);
  }

  /**
   * @param {HttpRequest} req
   * @return {{get:(name:string)=>string,all:(name:string)=>string[]}}
   */
  static cookies(req) {
    const instance = new RequestHeaders(req);
    return instance.cookies;
  }

  /** @type {Object<string,string[]>} */
  #cookiesProxy = null;

  /** @return {{get:(name:string)=>string,all:(name:string)=>string[]}} */
  get cookies() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instance = this;
    return {
      get(name) {
        return instance.cookieEntries[name]?.[0];
      },
      all(name) {
        return instance.cookieEntries[name] ?? [];
      },
    };
  }

  /** @return {Object<string,string[]>} */
  get cookieEntries() {
    if (!this.#cookiesProxy) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
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
          for (const element of split) {
            const [key, value] = element.split('=');
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
              if (Number.isNaN(Number.parseInt(arrayProp, 10))) {
                return Reflect.get(arrayTarget, arrayProp, receiver);
              }
              const entries = getEntriesFromCookie(instance.headers.cookie ?? '');
              let count = 0;
              for (const entry of entries) {
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
          for (const element of split) {
            const [key] = element.split('=');
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
}

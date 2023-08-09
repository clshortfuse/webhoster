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
  /** @param {HttpRequest} request */
  constructor(request) {
    const instance = instanceCache.get(request);
    if (instance) return instance;
    super(request.headers);
    instanceCache.set(request, this);
  }

  /**
   * @param {HttpRequest} request
   * @return {{get:(name:string)=>string,all:(name:string)=>string[]}}
   */
  static cookies(request) {
    const instance = new RequestHeaders(request);
    return instance.cookies;
  }

  /** @type {Object<string,string[]>} */
  #cookiesProxy = null;

  /** @return {{get:(name:string)=>string,all:(name:string)=>string[]}} */
  get cookies() {
    return {
      get: (name) => this.cookieEntries[name]?.[0],
      all: (name) => this.cookieEntries[name] ?? [],
    };
  }

  /** @return {Object<string,string[]>} */
  get cookieEntries() {
    if (!this.#cookiesProxy) {
      /** @type {Map<string,string[]>} */
      const arrayProxyMap = new Map();
      this.#cookiesProxy = new Proxy({}, {
        get: (cookieTarget, cookieName) => {
          if (typeof cookieName !== 'string') return undefined;
          if (arrayProxyMap.has(cookieName)) {
            return arrayProxyMap.get(cookieName);
          }
          const cookieString = (this.headers.cookie ?? '');
          const split = cookieString.split(';');
          const values = [];
          for (const element of split) {
            const [key, value] = element.split('=');
            if (key.trim() === cookieName) values.push(value);
          }
          const arrayProxy = new Proxy(values, {
            get: (arrayTarget, arrayProperty, receiver) => {
              if (typeof arrayProperty !== 'string') {
                return Reflect.get(arrayTarget, arrayProperty, receiver);
              }
              if (arrayProperty === 'length') {
                return getEntriesFromCookie(this.headers.cookie ?? '')
                  .filter(([key]) => (key === cookieName)).length;
              }
              if (Number.isNaN(Number.parseInt(arrayProperty, 10))) {
                return Reflect.get(arrayTarget, arrayProperty, receiver);
              }
              const entries = getEntriesFromCookie(this.headers.cookie ?? '');
              let count = 0;
              for (const entry of entries) {
                if (entry[0] === cookieName) {
                  if (arrayProperty === count.toString()) {
                    return entry[1];
                  }
                  count += 1;
                }
              }
              return Reflect.get(arrayTarget, arrayProperty, receiver);
            },
            set: (arrayTarget, arrayProperty, value, receiver) => {
              Reflect.set(arrayTarget, arrayProperty, value, receiver);
              if (typeof arrayProperty !== 'string') return true;
              const result = getEntriesFromCookie(this.headers.cookie ?? '').reduce((previous, current) => {
                if (!current[0]) return previous;
                if (current[0] === cookieName) return previous;
                return `${previous};${current[0]}=${current[1]}`;
              }, arrayTarget.map((v) => `${cookieName}=${v}`).join(';'));
              this.headers.cookie = result;
              return true;
            },
          });
          arrayProxyMap.set(cookieName, arrayProxy);
          return arrayProxy;
        },
        ownKeys: () => {
          const cookieString = (this.headers.cookie || '');
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
        has: (target, p) => /** @type {string} */ (this.headers.cookie)?.split(';')
          .some((cookie) => cookie.split('=')[0]?.trim() === p) ?? false,
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

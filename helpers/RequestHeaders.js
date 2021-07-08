import HeadersHandler from './HeadersParser.js';

/** @typedef {import('../types').HttpRequest} HttpRequest */

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
      name = pair.substr(0, indexOfEquals).trim();
      value = pair.substr(indexOfEquals + 1).trim();
    }
    const firstQuote = value.indexOf('"');
    const lastQuote = value.lastIndexOf('"');
    if (firstQuote !== -1 && lastQuote !== -1) {
      value = value.substring(firstQuote + 1, lastQuote);
    }
    return [name, value];
  });
}

export default class RequestHeaders extends HeadersHandler {
  /** @param {HttpRequest} req */
  constructor(req) {
    super(req.headers);
  }

  /** @type {Object<string,string[]>} */
  #cookiesProxy = null;

  get cookies() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instance = this;
    return {
      /**
       * @param {string} name
       * @return {string}
       */
      get(name) {
        return instance.cookieEntries[name]?.[0];
      },
      /**
       * @param {string} name
       * @return {string[]}
       */
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
}

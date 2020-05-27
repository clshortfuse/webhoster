/** @type {ProxyHandler<Object>} */
const defaultProxyHandler = {
  get(target, p, receiver) {
    return Reflect.get(target, typeof p === 'string' ? p.toLowerCase() : p, receiver);
  },
  set(target, p, receiver) {
    return Reflect.set(target, typeof p === 'string' ? p.toLowerCase() : p, receiver);
  },
  has(target, p) {
    return Reflect.has(target, typeof p === 'string' ? p.toLowerCase() : p);
  },
  deleteProperty(target, p) {
    return Reflect.deleteProperty(target, typeof p === 'string' ? p.toLowerCase() : p);
  },
};

export default class CaseInsensitiveObject {
  /** @param {Object} [object] */
  constructor(object) {
    if (object && object instanceof CaseInsensitiveObject) {
      return object;
    }
    const instance = this;
    const proxy = new Proxy(instance, defaultProxyHandler);
    Object.entries(object).forEach(([key, value]) => {
      this[key] = value;
    });
    return proxy;
  }
}


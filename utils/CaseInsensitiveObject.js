export default class CaseInsensitiveObject {
  /** @param {Object} [object] */
  constructor(object) {
    if (object && object instanceof CaseInsensitiveObject) {
      return object;
    }
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const instance = this;
    const proxy = new Proxy(instance, CaseInsensitiveObject.defaultProxyHandler);
    for (const [key, value] of Object.entries(object)) {
      // @ts-ignore Coerce
      this[key] = value;
    }
    return proxy;
  }
}

/** @type {ProxyHandler<Object>} */
CaseInsensitiveObject.defaultProxyHandler = {
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

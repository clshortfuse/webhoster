const store = new WeakMap();


export default class ExtendedProperties {
  /** @param {Object} object */
  constructor(object) {
    const cache = store.get(object);
    if (cache) {
      return cache;
    }
    store.set(object, this);
  }
}

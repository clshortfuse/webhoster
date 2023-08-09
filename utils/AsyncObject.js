/**
 * @template {any} T
 * @class AsyncObject<T>
 */
export default class AsyncObject {
  /** @param {T} [value] */
  constructor(value) {
    this.value = value;
    this.ready = false;
    this.busy = false;
    /** @type {{resolve:function(T):void, reject:function(Error?):void}[]} */
    this.pendingPromises = [];
  }

  hasValue() {
    return this.ready;
  }

  isBusy() {
    return this.busy;
  }

  /** @return {Promise<T>} */
  get() {
    if (!this.isBusy() && this.hasValue()) {
      return Promise.resolve(this.value);
    }
    return new Promise((resolve, reject) => {
      this.pendingPromises.push({ resolve, reject });
    });
  }

  /**
   * @param {T} [value]
   * @return {T}
   */
  set(value) {
    this.value = value;
    this.busy = false;
    this.ready = true;
    while (this.pendingPromises.length) {
      this.pendingPromises.shift().resolve(value);
    }
    return value;
  }

  /**
   * @param {Error} [error] Error passed to pending promises
   * @return {void}
   */
  reset(error) {
    this.value = undefined;
    this.busy = false;
    this.ready = false;
    while (this.pendingPromises.length) {
      this.pendingPromises.shift().reject(error);
    }
  }

  /**
   * Clear value and mark busy
   * @return {void}
   */
  prepare() {
    this.value = undefined;
    this.busy = true;
    this.ready = false;
  }

  /** @return {void} */
  setBusy() {
    this.busy = true;
  }
}

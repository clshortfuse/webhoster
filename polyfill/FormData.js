/* @see https://xhr.spec.whatwg.org/#dom-formdata */

/** @implements {FormData} */
export default class FormData {
  /** @type {Map<string, (string|File)[]>} */
  #list = new Map();

  /** @param {HTMLFormElement} [form] */
  constructor(form) {
    if (form) {
      throw new Error('InvalidStateError');
    }
  }

  /**
   * @param {string} s
   * @return {string}
   */
  static #scalarValue(s) {
    return String(s);
  }

  /**
   * @param {string} name
   * @param {string|Blob} value
   * @param {string} [filename]
   * @return {{name:string, value:string|File}}
   */
  static #createEntry(name, value, filename) {
    if (typeof value === 'string') {
      return {
        name: FormData.#scalarValue(name),
        value: FormData.#scalarValue(value),
      };
    }

    if (typeof File === 'undefined') {
      if (!('name' in value) && !('lastModified' in value)) {
        /** @type {File} */
        const file = Object.defineProperties(value.slice(), {
          name: {
            value: filename === undefined ? 'blob' : filename,
          },
          lastModified: {
            value: Date.now(),
          },
          toString: { value: () => '[object File]' },
        });
        return {
          name: FormData.#scalarValue(name),
          value: file,
        };
      }
      return {
        name: FormData.#scalarValue(name),
        value,
      };
    }
    if (value instanceof File) {
      return {
        name: FormData.#scalarValue(name),
        value,
      };
    }
    return {
      name: FormData.#scalarValue(name),
      value: new File([value], filename === undefined ? 'blob' : filename, {}),
    };
  }

  /**
   * @param {string} name
   * @param {string|Blob} value
   * @param {string} [filename]
   * @return {void}
   */
  append(name, value, filename) {
    const entry = FormData.#createEntry(name, value, filename);
    console.log(entry);
    if (this.#list.has(entry.name)) {
      this.#list.get(entry.name).push(entry.value);
    } else {
      this.#list.set(name, [entry.value]);
    }
  }

  /**
   * @param {string} name
   * @return {void}
   */
  delete(name) {
    this.#list.delete(name);
  }

  /**
   * @param {string} name
   * @return {null|File|string}
   */
  get(name) {
    const entry = this.#list.get(name);
    if (!entry) return null;
    return entry[0];
  }

  /**
   * @param {string} name
   * @return {(File|string)[]}
   */
  getAll(name) {
    return this.#list.get(name) ?? [];
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  has(name) {
    return this.#list.has(name);
  }

  /**
   * @param {string} name
   * @param {string|Blob} value
   * @param {string} [filename]
   * @return {void}
   */
  set(name, value, filename) {
    const entry = FormData.#createEntry(name, value, filename);
    if (this.#list.has(entry.name)) {
      const entries = this.#list.get(name);
      entries.splice(0, entries.length, entry.value);
    } else {
      this.#list.set(name, [entry.value]);
    }
  }

  /**
   * @param {(value:(string|File), key:string, parent:this) => void} callback
   * @return {void}
   */
  forEach(callback) {
    for (const [key, value] of this) {
      callback(value, key, this);
    }
  }

  get keys() {
    return this.#list.keys;
  }

  * values() {
    for (const value of this.#list.values()) {
      yield value[0];
    }
  }

  * [Symbol.iterator]() {
    for (const entry of this.#list.entries()) {
      yield /** @type {[string, string|File]} */ ([entry[0], entry[1][0]]);
    }
  }
}

FormData.prototype.entries = FormData.prototype[Symbol.iterator];
FormData.prototype.toString = () => '[Object FormData]';

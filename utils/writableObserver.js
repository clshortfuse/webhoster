/* eslint-disable no-param-reassign */

/** @typedef {import('stream').Writable} Writable */

/** @type {WeakMap<Writable, Function>} */
const functions = new WeakMap();
/** @type {WeakSet<Writable>} */
const endCalled = new WeakSet();


/**
 * @param {Writable} writable
 * @return {boolean}
 */
export function hasEndCalled(writable) {
  return endCalled.has(writable);
}

/**
 * @param {Writable} writable
 * @return {void}
 */
export function removeEndObserver(writable) {
  const oldFunction = functions.get(writable);
  if (!oldFunction) return;
  writable.end = oldFunction;
}


/**
 * Wraps a `Writable` object's `.end()` function to detect it has been called.
 * This capture occurs before the `'end'` event is emitted as well as before
 * `.write()` if called with chunk.
 * @param {Writable} writable
 * @return {void}
 */
export function addEndObserver(writable) {
  if (functions.has(writable)) {
    return;
  }
  functions.set(writable, writable.end);
  writable.end = (...args) => {
    endCalled.add(writable);
    removeEndObserver(writable);
    writable.end(...args);
  };
}

/** @typedef {import('stream').Readable} Readable */

/**
 * @param {Readable} readable
 * @return {Promise<any>}
 */
export function read(readable) {
  return new Promise((resolve, reject) => {
    readable.once('data', resolve);
    readable.once('error', reject);
  });
}

/**
 * @param {Readable} readable
 * @return {Promise<any[]>}
 */
export function readAll(readable) {
  return new Promise((resolve, reject) => {
    /** @type {any[]} */
    const chunks = [];
    readable.on('data', chunks.push);
    readable.on('end', () => resolve(chunks));
    readable.once('error', reject);
  });
}

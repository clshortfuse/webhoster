/** @typedef {import('stream').Readable} Readable */

/**
 * @param {Readable} readable
 * @return {Promise<any>}
 */
export async function readStreamChunk(readable) {
  return new Promise((resolve, reject) => readable.once('data', resolve).once('error', reject));
}

/**
 * @param {Readable} readable
 * @return {Promise<any[]>}
 */
export async function readAllChunks(readable) {
  return new Promise((resolve, reject) => {
    /** @type {any[]} */
    const chunks = [];
    readable.on('data', chunks.push);
    readable.on('end', () => resolve(chunks));
    readable.on('error', reject);
  });
}

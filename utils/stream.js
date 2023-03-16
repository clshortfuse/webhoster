/**
 * @param {import('node:stream').Writable|import('node:http').ServerResponse} writableLike
 * @return {boolean}
 */
export function isWritable(writableLike) {
  return (!writableLike.destroyed && !writableLike.writableEnded);
}

import { createHash } from 'node:crypto';
import {
  Readable, pipeline as legacyPipeline,
} from 'node:stream';
import { promisify } from 'node:util';

/** @type {import('node:stream/promises').pipeline} */
let pipeline;
try {
  ({ pipeline } = (await import('node:stream/promises')));
} catch {
  pipeline = promisify(legacyPipeline);
}

const BUFFER_SIZE = 1024 * 16;
const CHUNK_SIZE = 256 / 8;
const CHUNK_COUNT = BUFFER_SIZE / CHUNK_SIZE;

const SEED = Math.floor(Math.random() * (2 ** 4));

/** @yields {Buffer} */
function* binaryGenerator() {
  for (let i = 0; i < CHUNK_COUNT; i++) {
    const num = (SEED + i);
    yield createHash('sha256').update(Buffer.from([
      (num >> 24) & 255,
      (num >> 16) & 255,
      (num >> 8) & 255,
      num & 255,
    ])).digest();
  }
}

/** @yields {Buffer} */
function* textGenerator() {
  for (const chunk of binaryGenerator()) {
    const hexString = chunk.toString('hex');
    yield Buffer.from(hexString, 'utf-8');
  }
}

/** @return {Readable} */
export function getTestBinaryStream() {
  return Readable.from(binaryGenerator());
}

/** @return {Readable} */
export function getTestTextStream() {
  return Readable.from(textGenerator());
}

/** @return {Promise<string>} */
export async function getTestHash() {
  const hash = createHash('sha256');
  await pipeline(binaryGenerator(), hash);
  return hash.digest().toString('hex');
}

/** @return {string} */
export function getTestString() {
  let data = '';
  for (const chunk of textGenerator()) {
    data += chunk;
  }
  return data;
}

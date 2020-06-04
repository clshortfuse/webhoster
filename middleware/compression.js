import { PassThrough } from 'stream';
import { createDeflate, createGzip, createBrotliCompress } from 'zlib';
import { parseQualityValues } from '../utils/qualityValues.js';
import { addEndObserver, hasEndCalled } from '../utils/writableObserver.js';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */


/**
 * @typedef CompressionMiddlewareOptions
 * @prop {number} [chunkSize]
 * @prop {boolean} [respondNotAcceptable=true]
 */

const COMPATIBLE_ENCODINGS = ['br', 'gzip', 'deflate', 'identity', '*'];

/**
 * @param {MiddlewareFunctionParams} params
 * @param {CompressionMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeCompressionMiddleware({ req, res }, options = {}) {
  if (req.method === 'HEAD') {
    return 'continue';
  }
  const acceptString = req.headers['accept-encoding']?.toLowerCase();
  const encodings = parseQualityValues(acceptString);
  if (!encodings.size) {
    return 'continue';
  }
  let encoding = COMPATIBLE_ENCODINGS[0];
  const allowWildcards = (encodings.get('*')?.q !== 0);
  const encodingEntries = [...encodings.entries()];
  encoding = encodingEntries.find(([value, spec]) => spec.q !== 0 && COMPATIBLE_ENCODINGS.includes(value))?.[0];
  if (allowWildcards && (encoding === '*' || !encoding)) {
    // Server preference
    // Get first compatible encoding not specified
    encoding = COMPATIBLE_ENCODINGS.find((value) => !encodings.has(value));
  }
  if (allowWildcards && !encoding) {
    // Get highest q'd compatible encoding not q=0 or '*'
    encoding = encodingEntries
      .find(([value, spec]) => spec.q !== 0 && value !== '*' && COMPATIBLE_ENCODINGS.includes(value))?.[0];
  }
  if (!encoding && options.respondNotAcceptable !== false) {
    res.status = 406;
    return 'end';
  }
  if (!encoding || encoding === 'identity' || encoding === '*') {
    return 'continue';
  }
  res.headers['content-encoding'] = encoding;
  /** @type {import("zlib").Gzip} */
  let gzipStream;
  /** @type {import('zlib').ZlibOptions} */
  switch (encoding) {
    case 'deflate':
      gzipStream = createDeflate({
        chunkSize: options.chunkSize,
      });
      break;
    case 'gzip':
      gzipStream = createGzip({
        chunkSize: options.chunkSize,
      });
      break;
    case 'br':
      gzipStream = createBrotliCompress({
        chunkSize: options.chunkSize,
      });
      break;
    default:
      return Promise.reject(new Error('UNKNOWN_ENCODING'));
  }

  /** Some encodings include a header even with no data */
  let hasData = false;
  let encodingChanged = false;
  const newStream = new PassThrough();
  addEndObserver(newStream);
  const destination = res.replaceStream(newStream);
  newStream.once('data', (chunk) => {
    hasData = true;
    encodingChanged = res.headers['content-encoding'] !== encoding;
    const next = (encodingChanged ? destination : gzipStream);
    if (encodingChanged) gzipStream.destroy();
    if (hasEndCalled(newStream)) {
      next.end(chunk);
    } else {
      next.write(chunk);
      newStream.pipe(next);
    }
  });
  newStream.on('end', () => {
    if (!hasData) {
      gzipStream.destroy();
      destination.end();
    }
  });

  /** @type {Buffer[]} */
  const pendingChunks = [];
  gzipStream.on('data', (chunk) => {
    if (!hasData || hasEndCalled(newStream)) {
      pendingChunks.push(chunk);
    } else {
      let previousChunk;
      while (previousChunk = pendingChunks.shift()) {
        destination.write(previousChunk);
      }
      destination.write(chunk);
    }
  });
  gzipStream.on('end', () => {
    if (hasData) {
      let chunk;
      while (chunk = pendingChunks.shift()) {
        destination.write(chunk);
      }
    }
    destination.end();
  });
  return 'continue';
}

/**
 * @param {CompressionMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createCompressionMiddleware(options = {}) {
  return function compressionMiddleware(params) {
    return executeCompressionMiddleware(params, options);
  };
}

/** @type {MiddlewareFunction} */
export function defaultCompressionMiddleware(params) {
  return executeCompressionMiddleware(params);
}

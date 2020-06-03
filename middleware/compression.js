import { PassThrough } from 'stream';
import {
  createDeflate, createGzip, createBrotliCompress, constants,
} from 'zlib';
import { parseQualityValues } from '../utils/qualityValues.js';
import { addEndObserver, hasEndCalled } from '../utils/WritableObserver.js';

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
  let encoding = COMPATIBLE_ENCODINGS[0];
  if (encodings.size) {
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
  }
  if (!encoding || encoding === 'identity' || encoding === '*') {
    return 'continue';
  }
  res.headers['content-encoding'] = encoding;
  /** @type {import("zlib").Gzip} */
  let gzipStream;
  /** @type {import('zlib').ZlibOptions} */
  const gZipOptions = { flush: constants.Z_FINISH, chunkSize: options.chunkSize };
  switch (encoding) {
    case 'deflate':
      gzipStream = createDeflate(gZipOptions);
      break;
    case 'gzip':
      gzipStream = createGzip(gZipOptions);
      break;
    case 'br':
      gzipStream = createBrotliCompress(gZipOptions);
      break;
    default:
      return Promise.reject(new Error('UNKNOWN_ENCODING'));
  }

  let hasData = false;
  const newStream = new PassThrough();
  newStream.on('data', () => {
    hasData = true;
  });
  newStream.pipe(gzipStream);
  const destination = res.replaceStream(newStream);
  addEndObserver(newStream);
  gzipStream.on('data', (chunk) => {
    if (hasEndCalled(newStream) && !gzipStream._writableState.needDrain) {
      destination.end(hasData ? chunk : null);
    } else {
      destination.write(chunk);
    }
  });
  gzipStream.on('end', () => {
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

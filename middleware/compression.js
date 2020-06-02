import { PassThrough } from 'stream';
import { createDeflate, createGzip, createBrotliCompress } from 'zlib';
import { parseQualityValues } from '../utils/qualityValues.js';

/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

export const DEFAULT_MAX_BUFFER = 1024;

/**
 * @typedef CompressionMiddlewareOptions
 * @prop {number} [bufferSize=DEFAULT_MAX_BUFFER]
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
  let output;
  switch (encoding) {
    case 'deflate':
      output = createDeflate();
      break;
    case 'gzip':
      output = createGzip();
      break;
    case 'br':
      output = createBrotliCompress();
      break;
    default:
      return Promise.reject(new Error('UNKNOWN_ENCODING'));
  }

  const bufferSize = options.bufferSize ?? DEFAULT_MAX_BUFFER;
  const buffer = Buffer.alloc(DEFAULT_MAX_BUFFER);
  let originalSize = 0;
  let outputSize = 0;
  let flushedToRawStream = false;

  const passthrough = new PassThrough();
  passthrough.on('data', (data) => {
    originalSize += data[0].length;
  });
  passthrough.pipe(output);
  res.payload = passthrough;

  output.on('data', (chunk) => {
    const newCount = outputSize + chunk.length;
    if (newCount > bufferSize) {
      if (outputSize <= bufferSize) {
        // Send buffer now
        if (!res.headersSent) {
          res.sendHeaders();
        }
        res.rawStream.write(buffer.subarray(0, outputSize));
        flushedToRawStream = true;
      }
      // Send chunk
      res.rawStream.write(chunk);
    } else {
      // Buffer chunk
      chunk.copy(buffer, outputSize);
    }
    outputSize += chunk.length;
  });
  output.on('end', () => {
    if (originalSize === 0) {
      res.rawStream.end();
      return;
    }
    if (!res.headersSent) {
      // Set Content-Length in Header
      res.headers['Content-Length'] = outputSize;
      res.sendHeaders();
    }

    if (!flushedToRawStream) {
      res.rawStream.write(buffer.subarray(0, outputSize));
      flushedToRawStream = true;
    }
    // End response stream
    res.rawStream.end();
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

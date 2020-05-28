import zlib from 'zlib';
import { parseQualityValues } from '../utils/qualityValues.js';

export const DEFAULT_MAX_BUFFER = 1024;

/** @typedef {import('../lib/RequestHandler.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../lib/HttpRequest.js').default} HttpRequest */
/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */
/** @typedef {import('../lib/RequestHandler.js').MiddlewareResult} MiddlewareResult

/**
 * @typedef CompressionMiddlewareOptions
 * @prop {number} [bufferSize=DEFAULT_MAX_BUFFER]
 * @prop {boolean} [respondNotAcceptable=true]
 */

const COMPATIBLE_ENCODINGS = ['br', 'gzip', 'deflate', 'identity', '*'];

/**
 * @param {HttpRequest} req
 * @param {HttpResponse} res
 * @param {CompressionMiddlewareOptions} [options]
 * @return {MiddlewareResult}
 */
function executeMiddleware(req, res, options = {}) {
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
      return { completed: true };
    }
  }
  if (!encoding || encoding === 'identity' || encoding === '*') {
    return {};
  }
  res.headers['content-encoding'] = encoding;
  let output;
  switch (encoding) {
    case 'deflate':
      output = zlib.createDeflate();
      break;
    case 'gzip':
      output = zlib.createGzip();
      break;
    case 'br':
      output = zlib.createBrotliCompress();
      break;
    default:
      return Promise.reject(new Error('UNKNOWN_ENCODING'));
  }
  res.payload = output;
  const bufferSize = options.bufferSize ?? DEFAULT_MAX_BUFFER;
  const buffer = Buffer.alloc(DEFAULT_MAX_BUFFER);
  let outputSize = 0;
  let flushedToOriginalStream = false;
  output.on('data', (chunk) => {
    const newCount = outputSize + chunk.length;
    if (newCount > bufferSize) {
      if (outputSize <= bufferSize) {
        // Send buffer now
        if (!res.headersSent) {
          res.sendHeaders();
        }
        res.originalStream.write(buffer.subarray(0, outputSize));
        flushedToOriginalStream = true;
      }
      // Send chunk
      res.originalStream.write(chunk);
    } else {
      // Buffer chunk
      chunk.copy(buffer, outputSize);
    }
    outputSize += chunk.length;
  });
  output.on('end', () => {
    if (!res.headersSent) {
      // Set Content-Length in Header
      res.headers['Content-Length'] = outputSize;
      res.sendHeaders();
    }

    if (!flushedToOriginalStream) {
      res.originalStream.write(buffer.subarray(0, outputSize));
      flushedToOriginalStream = true;
    }
    // End response stream
    res.originalStream.end();
  });
  return {};
}

/**
 * @param {CompressionMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createCompressionMiddleware(options = {}) {
  return (req, res) => executeMiddleware(req, res, options);
}

/** @type {MiddlewareFunction}  */
export function defaultCompressionMiddleware(req, res) {
  return executeMiddleware(req, res);
}

import { PassThrough } from 'stream';

/** @typedef {import('stream').Readable} */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} BufferDecoderMiddlewareOptions
 * @prop {boolean} [parseJSON=false]
 * Automatically parses JSON if `application/json` mediatype
 * @prop {'entries'|'object'|'string'|'none'} [formURLEncodedFormat='none']
 * Automatically converts to object if `application/x-www-form-urlencoded` mediatype
 * @prop {boolean} [buildString=false]
 * Automatically builds string into one `read()` response
 */

/**
 * @param {string} charset
 * @return {BufferEncoding}
 */
function charsetAsBufferEncoding(charset) {
  switch (charset) {
    case 'iso-8859-1':
    case 'ascii':
    case 'binary':
    case 'latin1':
      return 'latin1';
    case 'utf-16le':
    case 'ucs-2':
    case 'ucs2':
    case 'utf16le':
      return 'utf16le';
    default:
    case 'utf-8':
    case 'utf8':
      return 'utf-8';
    case 'base64':
    case 'hex':
      return /** @type {BufferEncoding} */ (charset);
  }
}

/**
   * The application/x-www-form-urlencoded format is in many ways an aberrant monstrosity,
   * the result of many years of implementation accidents and compromises leading to a set of
   * requirements necessary for interoperability, but in no way representing good design practices.
   * In particular, readers are cautioned to pay close attention to the twisted details
   * involving repeated (and in some cases nested) conversions between character encodings and byte sequences.
   * Unfortunately the format is in widespread use due to the prevalence of HTML forms. [HTML]
   * @param {Buffer} buffer
   * @param {string} charset
   * @return {[string, string][]} Tuple
   */
function readUrlEncoded(buffer, charset) {
  // https://url.spec.whatwg.org/#urlencoded-parsing
  const bufferEncoding = charsetAsBufferEncoding(charset);

  const sequences = [];
  let startIndex = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0x26) {
      sequences.push(buffer.subarray(startIndex, i));
      startIndex = i + 1;
    }
    if (i === buffer.length - 1) {
      sequences.push(buffer.subarray(startIndex, i));
    }
  }
  /** @type {[string, string][]} */
  const output = [];
  sequences.forEach((bytes) => {
    if (!bytes.length) return;

    // Find 0x3D and replace 0x2B in one loop for better performance
    let indexOf0x3D = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      switch (bytes[i]) {
        case 0x3D:
          if (indexOf0x3D === -1) {
            indexOf0x3D = i;
          }
          break;
        case 0x2B:
          // Replace bytes on original stream for memory conservation
          // eslint-disable-next-line no-param-reassign
          bytes[i] = 0x20;
          break;
        default:
      }
    }
    let name;
    let value;
    if (indexOf0x3D === -1) {
      name = bytes;
      value = bytes.subarray(bytes.length, 0);
    } else {
      name = bytes.subarray(0, indexOf0x3D);
      value = bytes.subarray(indexOf0x3D + 1);
    }
    const nameString = decodeURIComponent(name.toString(bufferEncoding));
    const valueString = decodeURIComponent(value.toString(bufferEncoding));
    output.push([nameString, valueString]);
  });
  return output;
}

/**
 * @param {MiddlewareFunctionParams} params
 * @param {BufferDecoderMiddlewareOptions} [options]
 * @return {MiddlewareFunctionResult}
 */
function executeBufferDecoderMiddleware({ req, res }, options = {}) {
  if (req.method === 'HEAD') {
    return 'continue';
  }

  const contentType = (req.headers['content-type']);
  /** @type {string} */
  let mediaType;
  /** @type {string} */
  let charset;
  if (contentType) {
    contentType.split(';').forEach((directive) => {
      const parameters = directive.split('=');
      if (parameters.length === 1) {
        mediaType = directive.trim().toLowerCase();
        return;
      }
      if (parameters[0].trim().toLowerCase() !== 'charset') {
        return;
      }
      charset = parameters[1]?.trim().toLowerCase();
      const firstQuote = charset.indexOf('"');
      const lastQuote = charset.lastIndexOf('"');
      if (firstQuote !== -1 && lastQuote !== -1) {
        charset = charset.substring(firstQuote + 1, lastQuote);
      }
    });
  }

  const isFormUrlEncoded = mediaType === 'application/x-www-form-urlencoded';
  const isJSON = mediaType === 'application/json';
  if (!charset) {
    if (!mediaType) {
      return 'continue';
    }
    if (isFormUrlEncoded && (options.formURLEncodedFormat || 'none') === 'none') {
      return 'continue';
    }
    if (!isFormUrlEncoded && !isJSON && !mediaType.startsWith('text/')) {
      return 'continue';
    }
  }

  const readAll = isJSON || isFormUrlEncoded;

  const newReadable = new PassThrough({
    objectMode: true,
  });
  const source = req.replaceStream(newReadable);
  const decoderStream = new PassThrough();
  if (!isFormUrlEncoded) {
    console.log('making decoder');
    decoderStream.setEncoding(charsetAsBufferEncoding(charset));
  }
  source.pipe(decoderStream);

  let fullString = '';
  /** @type {Buffer[]} */
  const pendingChunks = [];

  decoderStream.on('data', (/** @type {Buffer|String} */ chunk) => {
    if (typeof chunk === 'string') {
      if (readAll || options.buildString) {
        fullString += chunk;
      }
    } else if (isFormUrlEncoded) {
      pendingChunks.push(chunk);
    } else {
      newReadable.write(chunk);
    }
  });
  decoderStream.on('end', () => {
    if (isFormUrlEncoded) {
      const combinedBuffer = Buffer.concat(pendingChunks);
      if (options.formURLEncodedFormat === 'object') {
        newReadable.end(Object.fromEntries(readUrlEncoded(combinedBuffer, charset)));
      } else if (options.formURLEncodedFormat === 'string') {
        newReadable.end(combinedBuffer.toString(charsetAsBufferEncoding(charset)));
      } else {
        newReadable.end(readUrlEncoded(combinedBuffer, charset));
      }
    } else if (isJSON && options.parseJSON) {
      newReadable.end(JSON.parse(fullString));
    } else if (fullString) {
      newReadable.end(fullString);
    } else {
      newReadable.end();
    }
  });

  return 'continue';
}

/**
 * @param {BufferDecoderMiddlewareOptions} options
 * @return {MiddlewareFunction}
 */
export function createBufferDecoderMiddleware(options = {}) {
  return function bufferDecoderMiddleware(params) {
    return executeBufferDecoderMiddleware(params, options);
  };
}

/** @type {MiddlewareFunction} */
export function defaultBufferDecoderMiddleware(params) {
  return executeBufferDecoderMiddleware(params);
}

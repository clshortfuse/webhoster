/** @typedef {import('../lib/HttpRequest.js').default} HttpRequest */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */

/**
 * The application/x-www-form-urlencoded format is in many ways an aberrant monstrosity,
 * the result of many years of implementation accidents and compromises leading to a set of
 * requirements necessary for interoperability, but in no way representing good design practices.
 * In particular, readers are cautioned to pay close attention to the twisted details
 * involving repeated (and in some cases nested) conversions between character encodings and byte sequences.
 * Unfortunately the format is in widespread use due to the prevalence of HTML forms. [HTML]
 * @see https://url.spec.whatwg.org/#urlencoded-parsing
 * @param {HttpRequest} request
 * @return {Promise<FormData>}
 */
async function parseFormUrlEncoded(request) {
  const output = new FormData();
  // https://url.spec.whatwg.org/#urlencoded-parsing

  const buffer = await request.buffer();
  const { bufferEncoding } = request;

  const sequences = [];
  let startIndex = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0x26) {
      sequences.push(buffer.subarray(startIndex, i));
      startIndex = i + 1;
    }
    if (i === buffer.length - 1) {
      sequences.push(buffer.subarray(startIndex, i + 1));
      break;
    }
  }

  for (const bytes of sequences) {
    if (!bytes.length) continue;

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
    output.append(nameString, valueString);
  }
  return output;
}

const CONTENT_READER = {
  type: 'application',
  subtype: 'x-www-form-urlencoded',
  parse: async (/** @type {HttpRequest} */ request) => Object.fromEntries(
    await parseFormUrlEncoded(request),
  ),
};

/**
 * @this {HttpRequest}
 * @return {Promise<FormData>}
 */
async function formData() {
  if (this.mediaType.type === 'application' && this.mediaType.subtype === 'x-www-form-urlencoded') {
    return await parseFormUrlEncoded(this);
  }
  throw new Error('UNSUPPORTED');
}

export default class ReadFormData {
  constructor() {
    this.execute = ReadFormData.Execute.bind(this);
  }

  /** @type {MiddlewareFunction} */
  static Execute({ request }) {
    request.formData = formData.bind(request);
    request.contentReaders.push(CONTENT_READER);
  }
}

import { Readable } from 'node:stream';
import { URLSearchParams } from 'node:url';

/** @typedef {import('../types').RequestMethod} RequestMethod */
/** @typedef {import('http').IncomingHttpHeaders} IncomingHttpHeaders */
/** @typedef {import('../types/index.js').MediaType} MediaType */

/** @typedef {Partial<MediaType> & {parse:(this:HttpRequest)=>any|PromiseLike<any>, test?:(this:HttpRequest, mediaType: MediaType)=>boolean}} ContentReaderRegistration */

/** @type {import('stream/consumers')} */
let streamConsumers;
try {
  streamConsumers = await import(new URL('node:stream/consumers').toString());
} catch {}

let BlobClass = (typeof Blob === 'undefined' ? undefined : Blob);

/**
 * @typedef HttpRequestOptions
 * @prop {IncomingHttpHeaders} [headers]
 * @prop {RequestMethod} method
 * @prop {Readable} stream
 * @prop {string} href URL.href
 * @prop {URL['origin']} origin URL.origin
 * @prop {URL['protocol']} protocol URL.protocol
 * @prop {URL['username']} username URL.username
 * @prop {URL['password']} password URL.password
 * @prop {URL['host']} host URL.host
 * @prop {URL['hostname']} hostname URL.hostname
 * @prop {URL['port']} port URL.port
 * @prop {URL['pathname']} pathname URL.pathname
 * @prop {URL['search']} search URL.search
 * @prop {URL['hash']} hash URL.hash
 * @prop {string} scheme
 * @prop {string} authority
 * @prop {string} path unparsed path
 * @prop {string} url unparsed url
 * @prop {string} query
 * @prop {string} fragment
 * @prop {any} [body]
 */

/**
 * @implements URL
 */
export default class HttpRequest {
  /** @type {ReadableStream} */
  #readable;

  #bodyUsed = false;

  /** @type {MediaType} */
  #mediaType;

  /** @param {HttpRequestOptions} options */
  constructor(options) {
    /** @type {IncomingHttpHeaders} */
    this.headers = options.headers ?? {};
    this.method = options.method;
    this.stream = options.stream;

    this.href = options.href;
    this.origin = options.origin;
    this.protocol = options.protocol;
    this.username = options.username;
    this.password = options.password;
    this.host = options.host;
    this.hostname = options.hostname;
    this.port = options.port;
    this.pathname = options.pathname;
    this.search = options.search;
    this.hash = options.hash;

    this.scheme = options.scheme;
    this.authority = options.authority;
    this.path = options.path;
    this.query = options.query;
    this.fragment = options.fragment;
    this.url = options.url;

    /** @type {any} */
    this.body = options.body;
  }

  // Per request buffer allocation limits

  /** @type {number} Minimum initial buffer size when working with chunks */
  MIN_INITIAL_BUFFER_SIZE = 16 * 1024; // 64KB

  /** @type {number} Maximium initial buffer size when working with chunks */
  MAX_INITIAL_BUFFER_SIZE = 4 * 1024 * 1024; // 4MB

  /** @type {number} Absolute maximum buffer size to be allocated per request. */
  MAX_BUFFER_SIZE = 64 * 1024 * 1024; // 64MB

  /** @type {ContentReaderRegistration[]} */
  contentReaders = [
    { type: 'text', parse: this.text },
    { type: 'application', subtype: 'json', parse: this.json },
    { suffix: 'json', parse: this.json },
  ];

  /**
   * @param {import('stream').Duplex} downstream
   * @param {Object} [options]
   * @param {boolean} [options.forwardErrors=true] Forward errors back toward source
   * @param {boolean} [options.autoPipe=true]
   * @param {boolean} [options.autoDestroy=true] Ignored if auto-piping
   * @param {boolean} [options.autoPause=false]
   * @return {Readable} previous tailend stream
   */
  addDownstream(downstream, options = {}) {
    const inputStream = this.stream;
    this.stream = downstream;

    if (!inputStream.readable) throw new Error('STREAM_NOT_READABLE');

    if (options.forwardErrors !== false) {
      downstream.on('error', (err) => inputStream.emit('error', err));
    }

    if (options.autoPipe !== false) {
      inputStream.pipe(downstream);
    } else if (options.autoDestroy !== false) {
      inputStream.on('close', () => downstream.destroy());
      inputStream.on('end', () => downstream.destroy());
    }

    if (options.autoPause) {
      inputStream.pause();
    }

    return inputStream;
  }

  get bodyUsed() { return this.#bodyUsed; }

  /**
   * @throws {Error<'NOT_SUPPORTED'>}
   * @return {?ReadableStream}
   */
  get readable() {
    if (this.#readable === undefined) {
      if (this.method === 'GET' || this.method === 'HEAD') {
        this.#readable = null;
      } else if (Readable.toWeb) {
        this.#readable = Readable.toWeb(this.stream);
        this.#bodyUsed = true;
      } else {
        // Should use await .blob().stream() instead.
        throw new Error('NOT_SUPPORTED');
      }
    }
    return this.#readable;
  }

  async read() {
    if (this.method === 'GET' || this.method === 'HEAD') {
      return this.searchParams;
    }
    const {
      type, tree, subtype, suffix,
    } = this.mediaType;
    for (const entry of this.contentReaders) {
      if (entry.type && entry.type !== type) continue;
      if (entry.subtype && entry.subtype !== subtype) continue;
      if (entry.tree && entry.tree !== tree) continue;
      if (entry.suffix && entry.suffix !== suffix) continue;
      if (entry.test && !entry.test.call(this, this.mediaType)) continue;
      // eslint-disable-next-line @typescript-eslint/return-await, no-await-in-loop
      return await entry.parse.call(this);
    }
    const chunks = [];
    for await (const chunk of this.stream) {
      chunks.push(chunk);
    }
    this.#bodyUsed = true;
    if (!chunks.length) return null;
    const [firstChunk] = chunks;
    if (chunks.length === 1) return firstChunk;
    if (Buffer.isBuffer(firstChunk)) {
      return Buffer.concat(chunks);
    }
    if (typeof firstChunk === 'string') {
      return chunks.join('');
    }
    return chunks;
  }

  /**
   * @throws {Error<'MAX_BUFFER_SIZE_REACHED'>}
   * @return {Promise<Buffer>}
   */
  async buffer() {
    try {
      if (streamConsumers) {
        return await streamConsumers.buffer(this.stream);
      }
      let buffer;
      let offset = 0;
      const sourceEncoding = this.stream.readableEncoding;
      for await (const c of this.stream) {
        const chunk = sourceEncoding ? Buffer.from(c, sourceEncoding) : c;
        if (!buffer) {
          // Initial buffer allocation. Use content-length as reference, but not hard requirement.
          // Size up to content-length, capped by MAX_INITIAL_BUFFER_SIZE
          // Size down to chunk-length, capped by MIN_INITIAL_BUFFER_SIZE
          const contentLength = Number.parseInt(this.headers['content-length'], 10);
          const initialSize = (contentLength > 0 && chunk.length < contentLength)
            ? Math.min(this.MAX_INITIAL_BUFFER_SIZE, contentLength)
            : Math.max(chunk.length, this.MIN_INITIAL_BUFFER_SIZE);
          buffer = Buffer.alloc(initialSize);
        } else if (buffer.length < offset + chunk.length) {
          if (buffer.length === this.MAX_BUFFER_SIZE) {
            throw new Error('MAX_BUFFER_SIZE_REACHED');
          }
          const tmpBuffer = buffer;
          buffer = Buffer.alloc(Math.min(this.MAX_BUFFER_SIZE, tmpBuffer.length * 2));
          tmpBuffer.copy(buffer, 0, 0, tmpBuffer.length);
        }
        chunk.copy(buffer, offset, 0, chunk.length);
        offset += chunk.length;
      }
      return buffer.slice(0, offset);
    } finally {
      this.#bodyUsed = true;
    }
  }

  /**
   * @return {Promise<ArrayBuffer>}
   */
  async arrayBuffer() {
    try {
      if (streamConsumers) {
        return await streamConsumers.arrayBuffer(this.stream);
      }
      const buffer = await this.buffer();
      return buffer.buffer;
    } finally {
      this.#bodyUsed = true;
    }
  }

  async blob() {
    if (streamConsumers) {
      const contentType = this.headers['content-type'];
      const result = await streamConsumers.blob(this.stream, {
        type: contentType,
      });
      this.#bodyUsed = true;
      if (!contentType || result.type === contentType) {
        return result;
      }
      // Proxy needed to set type.
      return new Proxy(result, {
        get: (target, p, receiver) => {
          if (p === 'type') return this.headers['content-type'];
          return Reflect.get(target, p, receiver);
        },
      });
    }

    if (BlobClass === undefined) {
      try {
        const module = await import('node:buffer');
        if ('Blob' in module === false) throw new Error('NOT_SUPPORTED');
        BlobClass = module.Blob;
      } catch {
        BlobClass = null;
      }
    }

    if (BlobClass === null) {
      throw new Error('NOT_SUPPORTED');
    }

    try {
      const chunks = [];
      for await (const chunk of this.stream) { chunks.push(chunk); }
      return new BlobClass(chunks, {
        type: this.headers['content-type'],
      });
    } finally {
      this.#bodyUsed = true;
    }
  }

  /** @return {Promise<any>} */
  async json() {
    if (streamConsumers) {
      this.#bodyUsed = true;
      return await streamConsumers.json(this.stream);
    }
    const text = await this.text();
    return JSON.parse(text);
  }

  async text() {
    try {
      const encoding = this.bufferEncoding;
      if (encoding === 'utf-8' && streamConsumers) {
        return await streamConsumers.text(this.stream);
      }

      // https://github.com/nodejs/node/blob/094b2a/lib/stream/consumers.js#L57
      const dec = new TextDecoder(encoding === 'utf16le' ? 'utf-16le' : encoding);
      let str = '';
      for await (const chunk of this.stream) {
        str += typeof chunk === 'string'
          ? chunk
          : dec.decode(chunk, { stream: true });
      }
      // Flush the streaming TextDecoder so that any pending
      // incomplete multibyte characters are handled.
      str += dec.decode(undefined, { stream: false });
      return str;
    } finally {
      this.#bodyUsed = true;
    }
  }

  get mediaType() {
    if (!this.#mediaType) {
      const contentType = this.headers['content-type'];
      let type;
      let tree;
      let subtype;
      let suffix;
      /** @type {Record<string,string>} */
      const parameters = {};
      if (contentType) {
        for (const directive of contentType.split(';')) {
          let [key, value] = directive.split('=');
          key = key.trim().toLowerCase();
          if (value === undefined) {
            let rest;
            [type, rest] = key.split('/');
            const treeEntries = rest.split('.');
            const subtypeSuffix = treeEntries.pop();
            tree = treeEntries.join('.');
            [subtype, suffix] = subtypeSuffix.split('+');
            continue;
          }

          value = value.trim();
          const firstQuote = value.indexOf('"');
          const lastQuote = value.lastIndexOf('"');
          if (firstQuote !== -1 && lastQuote !== -1) {
            if (firstQuote === lastQuote) {
              throw new Error('ERR_CONTENT_TYPE');
            }
            value = value.slice(firstQuote + 1, lastQuote);
          }
          parameters[key] = value;
        }
      }
      this.#mediaType = {
        type, subtype, suffix, tree, parameters,
      };
    }
    return this.#mediaType;
  }

  /** @return {null|undefined|string} */
  get charset() {
    return this.mediaType.parameters.charset;
  }

  get bufferEncoding() {
    const { charset } = this;
    switch (charset?.toLowerCase()) {
      default:
      case 'ascii': // Default
      case 'binary':
      case 'iso-8859-1':
      case 'latin1':
        return 'latin1';
      case 'ucs-2':
      case 'ucs2':
      case 'utf-16le':
      case 'utf16le':
        return 'utf16le';
      case 'utf-8':
      case 'utf8':
        return 'utf-8';
      case 'base64':
      case 'hex':
        return /** @type {BufferEncoding} */ (charset);
    }
  }

  async formData() {
    throw new Error('UNSUPPORTED_MEDIA_TYPE');
  }

  /** @type {URLSearchParams} */
  #searchParams;

  get searchParams() {
    if (!this.#searchParams) {
      this.#searchParams = new URLSearchParams(this.query);
    }
    return this.#searchParams;
  }

  toJSON() {
    return this.href;
  }

  toString() {
    return this.href;
  }
}

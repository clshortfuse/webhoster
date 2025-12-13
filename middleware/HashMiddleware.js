import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';

/** @typedef {import('node:crypto').BinaryToTextEncoding} BinaryToTextEncoding */
/** @typedef {import('../lib/HttpRequest.js').default} HttpRequest */
/** @typedef {import('../lib/HttpResponse.js').default} HttpResponse */
/** @typedef {import('../data/custom-types.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../data/custom-types.js').ResponseFinalizer} ResponseFinalizer */

const DEFAULT_ALGORITHM = 'sha1';
/** @type {BinaryToTextEncoding} */
const DEFAULT_DIGEST = 'base64';

/**
 * @typedef {Object} HashMiddlewareOptions
 * @prop {'md5'|'sha1'|'sha256'|'sha512'} [algorithm=DEFAULT_ALGORITHM]
 * @prop {BinaryToTextEncoding} [digest=DEFAULT_DIGEST]
 */

export default class HashMiddleware {
  /** @param {HashMiddlewareOptions} options */
  constructor(options = {}) {
    this.algorithm = options.algorithm || DEFAULT_ALGORITHM;
    this.digest = options.digest || DEFAULT_DIGEST;
    this.finalizeResponse = this.finalizeResponse.bind(this);
  }

  /**
   * @param {HttpResponse} response
   * @return {void}
   */
  addTransformStream(response) {
    if (response.headers.etag != null || response.headers.digest != null) return;

    const { algorithm, digest } = this;
    let hasData = false;
    let length = 0;
    let abort = false;
    const hashStream = createHash(algorithm);
    response.pipes.push(new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        length += chunk.length;
        hasData = true;

        if (!abort) {
          if (response.headersSent) {
            abort = true;
            hashStream.destroy();
          } else {
            // Manually pipe
            const isSync = hashStream.write(chunk, (error) => {
              if (!isSync) {
                callback(error, chunk);
              }
            });
            if (!isSync) return;
          }
        }
        callback(null, chunk);
      },
      final(callback) {
        if (!abort && hasData && response.status !== 206 && !response.headersSent) {
          const hash = hashStream.digest(digest);
          // https://tools.ietf.org/html/rfc7232#section-2.3
          if (response.headers.etag == null) {
            response.headers.etag = `${algorithm === 'md5' ? 'W/' : ''}"${length.toString(16)}-${hash}"`;
          }
          if (digest === 'base64') {
            response.headers.digest = `${algorithm}=${hash}`;
            if ((algorithm === 'md5')) {
              response.headers['content-md5'] = hash;
            }
          }
        }
        callback();
      },
    }));
  }

  /** @type {ResponseFinalizer} */
  finalizeResponse(response) {
    if (response.status === 206 || response.body == null) return;
    if (response.isStreaming) {
      this.addTransformStream(response);
      return;
    }
    if (!Buffer.isBuffer(response.body) || response.body.byteLength === 0) return;

    const { algorithm, digest } = this;
    const hash = createHash(algorithm).update(response.body).digest(digest);

    // https://tools.ietf.org/html/rfc7232#section-2.3
    if (response.headers.etag == null) {
      response.headers.etag = `${algorithm === 'md5' ? 'W/' : ''}"${response.body.byteLength.toString(16)}-${hash}"`;
    }
    if (digest === 'base64') {
      response.headers.digest = `${algorithm}=${hash}`;
      if ((algorithm === 'md5')) {
        response.headers['content-md5'] = hash;
      }
    }
  }

  /** @type {MiddlewareFunction} */
  execute({ response }) {
    response.finalizers.push(this.finalizeResponse);
  }
}

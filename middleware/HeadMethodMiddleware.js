/** @typedef {import('../types/index.js').HttpTransaction} HttpTransaction */
/** @typedef {import('../types/index.js').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types/index.js').ResponseFinalizer} ResponseFinalizer */

import { Transform } from 'node:stream';

export default class HeadMethodMiddleware {
  constructor() {
    this.execute = HeadMethodMiddleware.Execute.bind(this);
  }

  /** @type {ConstructorParameters<typeof Transform>[0]} */
  static DEFAULT_TRANSFORM_OPTIONS = {
    objectMode: true,
    transform(chunk, encoding, callback) { callback(); },
  };

  /** @type {ResponseFinalizer} */
  static FinalizeResponse(response) {
    if (response.isStreaming) {
      response.pipes.push(new Transform(HeadMethodMiddleware.DEFAULT_TRANSFORM_OPTIONS));
      return;
    }
    response.body = null;
  }

  /** @type {MiddlewareFunction} */
  static Execute({ request, response }) {
    if (request.method !== 'HEAD') return;
    response.finalizers.push(HeadMethodMiddleware.FinalizeResponse);
  }
}

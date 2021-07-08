import { PassThrough } from 'stream';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/**
 * @typedef {Object} SendHeadersMiddlewareOptions
 * @prop {boolean} [setStatus=false]
 * Automatically set `200` or `204` status if not set
 */

/** @implements {IMiddleware} */
export default class SendHeadersMiddleware {
  /** @param {SendHeadersMiddlewareOptions} options */
  constructor(options = {}) {
    this.setStatus = options.setStatus === true;
  }

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  execute({ res }) {
    const newWritable = new PassThrough();
    const destination = res.replaceStream(newWritable);
    newWritable.once('data', () => {
      if (!res.headersSent) {
        if (this.setStatus && res.status == null) {
          res.status = 200;
        }
        res.sendHeaders(false);
      }
    });
    newWritable.on('end', () => {
      if (!res.headersSent) {
        if (this.setStatus && res.status == null) {
          res.status = 204;
        }
        res.sendHeaders(false);
      }
    });
    newWritable.pipe(destination);
    return 'continue';
  }
}

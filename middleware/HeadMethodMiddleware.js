import { PassThrough } from 'stream';

/** @typedef {import('../types').IMiddleware} IMiddleware */
/** @typedef {import('../types').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('../types').MiddlewareFunctionParams} MiddlewareFunctionParams */
/** @typedef {import('../types').MiddlewareFunctionResult} MiddlewareFunctionResult */

/** @implements {IMiddleware} */
export default class HeadMethodMiddleware {
  constructor() {
    this.execute = HeadMethodMiddleware.execute.bind(this);
  }

  /**
   * @param {MiddlewareFunctionParams} params
   * @return {MiddlewareFunctionResult}
   */
  static execute({ req, res }) {
    if (req.method !== 'HEAD') {
      return 'continue';
    }
    const newWritable = new PassThrough({});
    const destination = res.replaceStream(newWritable);
    newWritable.on('end', () => {
      destination.end();
    });
    return 'continue';
  }
}
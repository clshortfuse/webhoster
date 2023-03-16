/** @typedef {import('../lib/HttpHandler').default} HttpHandler */
/** @typedef {import('http2').Http2SecureServer} Http2SecureServer */

/**
 * @param {HttpHandler} httpHandler
 * @param {RegExp} [socketioPath] /^\/socket.io\//i
 * @return {void}
 */
export function addHttp2Support(httpHandler, socketioPath = /^\/socket\.io\//i) {
  const fn = httpHandler.handleHttp2Stream;
  /** @type {fn} */
  const newFunction = (...args) => {
    const [, headers] = args;
    if (headers?.[':path']?.match(socketioPath)) {
      return Promise.resolve(null);
    }
    return fn.call(httpHandler, ...args);
  };
  // eslint-disable-next-line no-param-reassign
  httpHandler.handleHttp2Stream = newFunction;
}

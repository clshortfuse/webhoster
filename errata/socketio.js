/** @typedef {import('../lib/HttpHandler').default} HttpHandler */
/** @typedef {import('http2').Http2SecureServer} Http2SecureServer */

/**
 * @param {HttpHandler} httpHandler
 * @param {RegExp} [socketioPath] /^\/socket.io\//i
 * @return {void}
 */
export function addHttp2Support(httpHandler, socketioPath = /^\/socket\.io\//i) {
  const previous = httpHandler.handleHttp2Stream;
  // eslint-disable-next-line no-param-reassign, unicorn/prevent-abbreviations
  httpHandler.handleHttp2Stream = (...args) => {
    const [, headers] = args;
    if (headers?.[':path']?.match(socketioPath)) {
      return Promise.resolve(null);
    }
    return previous.call(httpHandler, ...args);
  };
}

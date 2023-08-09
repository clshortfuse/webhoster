import http2 from 'node:http2';

import { HTTPS_HOST, HTTPS_PORT } from './constants.js';

/** @type {http2.Http2SecureServer} */
let http2Server = null;

/**
 * @param {http2.SecureServerOptions} [options]
 * @return {Promise<http2.Http2SecureServer>}
 */
export function start(options = {}) {
  return new Promise((resolve, reject) => {
    http2Server = http2.createSecureServer(options);
    http2Server.listen(HTTPS_PORT, HTTPS_HOST, () => resolve(http2Server));
    http2Server.addListener('error', reject);
  });
}

/** @return {Promise<void>} */
export function stop() {
  return new Promise((resolve, reject) => {
    if (!http2Server) {
      resolve();
      return;
    }
    http2Server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

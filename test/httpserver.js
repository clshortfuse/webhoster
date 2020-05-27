import http from 'http';
import { HTTP_HOST, HTTP_PORT } from './constants.js';

/** @type {http.Server} */
let httpServer = null;

/** @return {Promise<http.Server>} */
export function start() {
  return new Promise((resolve, reject) => {
    httpServer = http.createServer();
    httpServer.listen(HTTP_PORT, HTTP_HOST, () => resolve(httpServer));
    httpServer.addListener('error', reject);
  });
}

/** @return {Promise<void>} */
export function stop() {
  return new Promise((resolve, reject) => {
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

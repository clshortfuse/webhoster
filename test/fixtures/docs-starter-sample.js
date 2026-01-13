import { start } from 'webhoster/templates/starter.js';
import HttpListener from 'webhoster/helpers/HttpListener.js';

const middleware = [
  () => 'Hello from the starter template',
];

export async function startServer({ host = '127.0.0.1', port = 0 } = {}) {
  await start({ host, port, middleware });
  return HttpListener.defaultInstance;
}

export async function stopServer() {
  await HttpListener.defaultInstance.stopAll();
}

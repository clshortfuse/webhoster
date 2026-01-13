import * as starter from 'webhoster/templates/starter.js';
import HttpListener from 'webhoster/helpers/HttpListener.js';

const middleware = [() => 'Hello world!'];

export async function startServer({ host = '127.0.0.1', port = 0 } = {}) {
  await starter.start({ host, port, middleware });
  return HttpListener.defaultInstance;
}

export async function stopServer() {
  await HttpListener.defaultInstance.stopAll();
}

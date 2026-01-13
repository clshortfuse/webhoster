# Getting started

## Install

```sh
npm install webhoster
```

## Minimal server

**Recommended:** use the starter template first. It wires the standard middleware
stack and starts the server quickly.

```js
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
```

If you want to build the stack manually, here is the minimal, explicit setup:

```js
import HttpHandler from 'webhoster/lib/HttpHandler.js';
import HttpListener from 'webhoster/helpers/HttpListener.js';
import SendStringMiddleware from 'webhoster/middleware/SendStringMiddleware.js';
import AutoHeadersMiddleware from 'webhoster/middleware/AutoHeadersMiddleware.js';

export async function startServer({ host = '127.0.0.1', port = 0 } = {}) {
  HttpHandler.defaultInstance.middleware.push(
    new SendStringMiddleware(),
    new AutoHeadersMiddleware(),
    ({ response }) => {
      response.headers['content-type'] = 'text/plain; charset=utf-8';
      return 'hello world';
    },
  );

  HttpListener.defaultInstance.configure({
    insecureHost: host,
    insecurePort: port,
  });

  await HttpListener.defaultInstance.startHttpServer();
  return HttpListener.defaultInstance;
}

export async function stopServer() {
  await HttpListener.defaultInstance.stopAll();
}
```

## Philosophy

By default, webhoster does nothing. It parses no headers, writes no headers,
never writes to or reads from any stream. Every behavior is opt-in via
middleware.

## Next steps

- Add middleware for decoding, encoding, hashing, and headers.
- Add routing with `PathMiddleware` and `MethodMiddleware`.
- Add HTTP/2 and HTTPS via `HttpListener` configuration.

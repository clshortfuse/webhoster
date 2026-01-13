# Starter template sample

This sample shows the simplest way to bootstrap a server using the starter
helper. It uses the default middleware stack provided by
`webhoster/templates/starter.js` and returns a plain text response.

## Example

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

## Notes

- `start()` uses the singleton `HttpHandler` and `HttpListener` instances.
- Returning a string is handled by `SendStringMiddleware` in the starter stack.
- Use `port: 0` to let the OS select an available port.

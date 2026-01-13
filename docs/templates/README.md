# Templates

## starter.js

A full starter that wires a standard middleware stack and an HTTP server.

```js
import { start } from 'webhoster/templates/starter.js';
import HttpListener from 'webhoster/helpers/HttpListener.js';

export async function startServer({ host = '127.0.0.1', port = 0 } = {}) {
  await start({
    host,
    port,
    middleware: [() => 'ok'],
  });
  return HttpListener.defaultInstance;
}

export async function stopServer() {
  await HttpListener.defaultInstance.stopAll();
}
```

This template configures:

- Request decoding
- String/JSON send helpers
- Response compression
- Hash/ETag generation
- Content length
- Auto headers
- HEAD handling

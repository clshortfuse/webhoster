# Samples

Samples are the primary way to learn webhoster patterns. Start here and copy
patterns into your own app.

## Quick samples

- [Minimal starter](./README.md#minimal-starter)
- [Starter template sample](./starter.md)
- [Advanced server pattern](./advanced-server.md)

## Minimal starter

See `examples/starter.js` for a minimal runnable example using the starter
template.

```js
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
```

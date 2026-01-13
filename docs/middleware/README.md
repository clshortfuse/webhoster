# Middleware

Middleware is the primary extension point in webhoster. Middleware can:

- Transform request streams before logic runs.
- Produce a response (ending the chain).
- Branch and filter logic based on path or method.

## Flow instructions

A middleware can return:

- `HttpHandler.CONTINUE` (or `true`, `null`, `undefined`)
- `HttpHandler.BREAK` (or `false`)
- `HttpHandler.END` (or `0`)
- a status code number (ends with that status)
- any other value (passed to `HttpResponse.end()`)

## Recommended default chain

```js
import ContentDecoderMiddleware from 'webhoster/middleware/ContentDecoderMiddleware.js';
import SendStringMiddleware from 'webhoster/middleware/SendStringMiddleware.js';
import SendJsonMiddleware from 'webhoster/middleware/SendJsonMiddleware.js';
import ContentEncoderMiddleware from 'webhoster/middleware/ContentEncoderMiddleware.js';
import HashMiddleware from 'webhoster/middleware/HashMiddleware.js';
import ContentLengthMiddleware from 'webhoster/middleware/ContentLengthMiddleware.js';
import AutoHeadersMiddleware from 'webhoster/middleware/AutoHeadersMiddleware.js';
import HeadMethodMiddleware from 'webhoster/middleware/HeadMethodMiddleware.js';

export const middleware = [
  new ContentDecoderMiddleware(),
  new SendStringMiddleware(),
  new SendJsonMiddleware(),
  new ContentEncoderMiddleware(),
  new HashMiddleware(),
  new ContentLengthMiddleware(),
  new AutoHeadersMiddleware(),
  new HeadMethodMiddleware(),
];
```

## Included middleware

### Response middleware

- `AutoHeadersMiddleware`: sends headers at the right time.
- `ContentLengthMiddleware`: sets `Content-Length` based on body writes.
- `HashMiddleware`: sets `ETag`, `Digest`, and `Content-MD5`.
- `ContentEncoderMiddleware`: applies `Content-Encoding` based on `Accept-Encoding`.
- `SendJsonMiddleware`: encodes objects/arrays to JSON and sets `content-type`.
- `SendStringMiddleware`: encodes strings with the correct charset.
- `HeadMethodMiddleware`: strips body for `HEAD` responses.

### Request middleware

- `ContentDecoderMiddleware`: decodes incoming `Content-Encoding`.
- `ReadFormData`: reads and parses `multipart/form-data`.

### Logic middleware

- `PathMiddleware`: branch on URL path.
- `MethodMiddleware`: branch on request method.
- `CORSMiddleware`: handles CORS preflight and headers.
- `CaseInsensitiveHeadersMiddleware`: normalizes headers for case-insensitive access.

## Branching example

```js
import HttpHandler from 'webhoster/lib/HttpHandler.js';
import PathMiddleware from 'webhoster/middleware/PathMiddleware.js';
import MethodMiddleware from 'webhoster/middleware/MethodMiddleware.js';

const myAPIGetFunctions = () => ({ ok: true });
const myAPIPostFunctions = async ({ request }) => request.read();
const indexPageMiddleware = () => 'hello';

HttpHandler.defaultInstance.middleware.push(
  [
    PathMiddleware.SUBPATH('/api'),
    [MethodMiddleware.GET, myAPIGetFunctions],
    [MethodMiddleware.POST, myAPIPostFunctions],
  ],
  [
    new PathMiddleware(/^\/(index\.html?)?$/),
    indexPageMiddleware,
  ],
  404,
);
```

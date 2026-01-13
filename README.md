![npm](https://img.shields.io/npm/v/webhoster) ![David](https://img.shields.io/david/clshortfuse/webhoster) ![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/clshortfuse/webhoster) ![node-current](https://img.shields.io/node/v/webhoster) ![npm](https://img.shields.io/npm/dw/webhoster) ![GitHub top language](https://img.shields.io/github/languages/top/clshortfuse/webhoster)

<!-- Per-node test status badges (matrix job names must match `test-matrix.yml` job names) -->
![Node 16.13](https://img.shields.io/github/actions/workflow/status/clshortfuse/webhoster/test-matrix.yml?branch=master&label=Node%2016.13&job=Test%20on%20Node%2016.13)
![Node 16](https://img.shields.io/github/actions/workflow/status/clshortfuse/webhoster/test-matrix.yml?branch=master&label=Node%2016&job=Test%20on%20Node%2016)
![Node 18](https://img.shields.io/github/actions/workflow/status/clshortfuse/webhoster/test-matrix.yml?branch=master&label=Node%2018&job=Test%20on%20Node%2018)
![Node 20](https://img.shields.io/github/actions/workflow/status/clshortfuse/webhoster/test-matrix.yml?branch=master&label=Node%2020&job=Test%20on%20Node%2020)
![Node 22](https://img.shields.io/github/actions/workflow/status/clshortfuse/webhoster/test-matrix.yml?branch=master&label=Node%2022&job=Test%20on%20Node%2022)

<!-- Note: these badges reflect the job named "Test on Node <version>" in `.github/workflows/test-matrix.yml`. -->

# webhoster

An opt-in, stream-based, tree-processing approach to Web Hosting with NodeJS.

* Supports HTTP
* Supports HTTPS
* Supports HTTP/2

#### Nothing is true; everything is permitted

By default, the framework does nothing. It parses no headers. It writes no headers. It never writes to or reads from any stream. All processing is handled by middleware. All middleware is built to provide maximum throughput and do as little as possible.

## install

`npm install webhoster`

## Quick Start

** Coming soon! ** 

For now, take a look at [/test/index.js](/test/index.js)

## Docs

Start at [docs/README.md](./docs/README.md) for the documentation index.

## Core

### [HttpHandler.js](/lib/HttpHandler.js)
*Class that handles the logic for handling requests and responses*

* `.defaultInstance` - (`HttpHandler`) - Returns a instance of `HttpHandler` that can be accessed staticly.
* `.middleware` - (`Middleware[]`) - An array of middleware operations to iterate through when handling a request. It is recommended to create isolated branches (eg: `/images/`; `/api/`; `/views/`; etc.).
* `.errorHandlers` - (`MiddlewareErrorHandler[]`) - An array of `MiddlewareErrorHandler` that will handle errors and respond appropriately (eg: `res.status = 500`)
* `.handleRequest` - (`function(HttpTransaction):Promise<HttpResponse>`) - handles logic for calling middleware and error handlers. Unlikely to be used directly.
* `.handleHttp1Request` - (`function(IncomingMessage, ServerResponse):Promise<HttpResponse>`) - constructs a new `HttpRequest` and `HttpResponse` based on the HTTP1 parameters and passes it to `handleRequest`
* `.handleHttp2Stream` - (`function(ServerHttp2Stream, IncomingHttpHeaders, HttpResponseOptions):Promise<HttpResponse>`) - constructs a new `HttpRequest` and `HttpResponse` based on the HTTP2 parameters and passes it to `handleRequest`

### Example

````js
  const handler = HttpHandler.defaultInstance;
  handler.middleware.push(
    new ContentDecoderMiddleware(), // Automatically decodes content
    new SendStringMiddleware(), // Auto convert strings to Buffer
    new SendJsonMiddleware(), // Auto converts objects to JSON
    new ContentEncoderMiddleware(), // Compress anything after
    new HashMiddleware(), // Hash anything after
    new ContentLengthMiddleware(), // Calculate length of anything after
    new AutoHeadersMiddleware(), // Send headers automatically
    new HeadMethodMiddleware(), // Discard body content
  );
  handler.middleware.push(
    imagesMiddleware,
    return404Middleware,
  );
  handler.errorHandlers.push(
    errorLoggerMiddleware,
    return500Middleware,
  );
  http1Server.addListener('request', handler.handleHttp1Request);
  http2Server.addListener('stream', handler.handleHttp2Stream);
````

### [HttpRequest.js](/lib/HttpRequest.js)
*Class that provides the bare-minimum to bridge different protocols for client requests*

* `.read()` - `Promise<any>` - Returns content as handled by request's content handlers. Returns `.raw()` if no compatible handler found.
* `.stream` - (`Readable`) - Allows for direct interaction with tail-end of the request stream pipeline. With no middleware, it emits `Buffer` chunks.
* `.body` - (`ReadableStream`) - Returns request's body as `ReadableStream` (if supported).
* `.bodyUsed` - (`boolean`) - Returns whether request's body has been read from.
* `.arrayBuffer()` - (`Promise<ArrayBuffer>`) - Returns a promise fulfilled with request's body as `ArrayBuffer`.
* `.blob()` - (`Promise<Blob>`) - Returns a promise fulfilled with request's body as `Blob`.
* `.formData()` - (`Promise<FormData>`) - Returns a promise fulfilled with request's body as `FormData`. Not implemented by default.
* `.json()` - (`Promise<any>`) - Returns a promise fulfilled with request's body parsed as `JSON`.
* `.text()` - (`Promise<string>`) - Returns a promise fulfilled with request's body as `string`.
* `.headers` - (`IncomingHttpHeaders`) - The response headers exactly as presented to the NodeJS Server with no modifications.
* `.locals` - (`Object<string,any>`) - Object that gets passed in every step of the middleware tree. Application-level variables *should* be presented here.
* `.addDownstream()` - (`function(stream:Readable):Readable`) - adds a downstream to the current pipeline. Used by preprocessor middleware for the purpose of transforming data (eg: JSON-parsing) before reaching logic middleware.

### Example

````js
async function onPostComment({ request }) {
  const content = await request.read();
  let comment;
  try {
    comment = new UserComment(content);
  } catch {
    return 400;
  }
  try {
    await insertComment(comment);
  } catch {
    return 500;
  }
  return { status: 'OK' };
}
````

### [HttpResponse.js](/lib/HttpResponse.js)
*Class that provides the bare-minimum to bridge different protocols for client responses*

* `end(content:any) => HttpHandler.END` - Content to be sent to the client based on the Content Handler configured. The function will call `.stream.end` and return `HttpHandler.END`.
* `headers` - (`OutgoingHttpHeaders`) - The response headers exactly as presented to the NodeJS Server with no modifications.
* `content` - (`any`) - Content that will be sent to client.
* `status` - (`number`) - The response status code
* `setStatus(statusCode:number) => this` - Sets `.status` while returning `this` (`HttpResponse`). Will throw an `Error` if headers have already been sent.
* `code(statusCode:number) => this` - Sets `.status` while returning `this` (`HttpResponse).
* `async send(content:any)` - Similar to `end`, but asynchronous. Return when the client stream ends, confirming the data was sent, or throws an error on failure. Useful for ensuring client received the data.
* `stream` - (`Writable`) - Used for interacting with the stream. With no custom middleware, it accepts a `Buffer` or `string`.
* `pipeFrom(source:any)` -  Creates a pipeline starting with source. May insert `.pipeProcessors` into pipeline. Returns `HttpHandler.END`;
* `pipelineFrom(source:any) => Promise<HttpHandler.END>` - Similar to `pipeFrom`, but asynchronous. Return when the client stream ends, confirming the data was sent, or throws an error on failure. Useful for ensuring client received the data.
* `.finalizers` - Array of body processors that may read and transform `.body`, or simply analyze on `.body`.
* `.canPushPath` - (`boolean`) - `true` on HTTP/2 streams that support push
* `.pushPath` - (`function(path:string):Promise`) - Push a new HTTP/2 stream simulating a request for `path`

### Example

````js
async function onGetIndexPage(transaction) {
  if (transaction.canPushPath) {
    transaction.pushPath('/script.js').catch(() => { /* Ignore push failure */ });
    transaction.pushPath('/styles.css').catch(() => { /* Ignore push failure */ });;
  }
  transaction.response.header['content-type'] = 'text/html';
  return await getIndexPage();
}
````

## Middleware

#### MiddlewareFunction

Middleware logic flows in a tree structure, allowing for `continue`, `break`, or `end`.

A `MiddlewareFunction` is a function that accepts a `HttpTransaction` object structured as `{ res: HttpRequest, res: HttpResponse }`. The function can return a instruction with the step in the tree-based logic, status code, or content body to be handled. It maybe return any of these instructions with any of the values as a literal, a `Promise`, or `PromiseLike`:

* `HttpHandler.CONTINUE`: Continues on the current branch to the next middleware, or moves to the next branch if there are no siblings left. `alias: true|void|null|undefined`
* `HttpHandler.BREAK`: Breaks from the current middleware branch, and continues to the next branch. `alias: false`
* `HttpHandler.END`: Terminates the entire middleware tree. `alias: 0`
* `number`: Sets status code and then ends stream. `alias: res.code(statusCode).end()`
* `Set|Map`: Add an inline middleware branch. 
* `Array`: Explicitly passed to `HttpResponse.end()`. This is to support sending an `Array` object instead having it becoming an inline middleware branch.
* `any`: Any other value returned would automatically be passed to `HttpResponse.end()` which, in turn, uses it's own content handlers (eg: `JSON`; `Readable`), and finally terminates the middleware tree.

A `MiddlewareFilter` is a function that accepts a `HttpTransaction` and returns a `boolean` or `Promise<boolean>` signaling whether to continue in the branch. `true` translates to `HttpHandler.CONTINUE`. `false` translates to `HttpHandler.BREAK`. There is no support for `HttpHandler.END` logic in a MiddlewareFilter by design.

A `MiddlewareErrorHandler` is an `Object` with a `onError` property. `onError` is like a MiddlewareFunction, but includes an `err` item in its parameter object. When the handler is in an error state, it will bubble upwards while searching for the next `MiddlewareErrorHandler`.

`Middleware` can be a `MiddlewareFunction` or `MiddlewareFilter`. It can also a compatible response value of either: `HttpHandler.CONTINUE|true|null|void|undefined`, `HttpHandler.BREAK|false`, `HttpHandler.END|0`. The response can be the value or a `Promise`.

To support branching, `Middleware` can also be a `Iterable<Middleware>` (eg: `Set`) or `Map<any, Middleware>`. The `HttpHandler` will iterate through each and flow based on the `break`, `continue`, or `end` instruction returned by each entry.

## Included Middleware

### Response Middleware
* [AuthHeaders](./middleware/AutoHeadersMiddleware.js) - Automatically sends response headers before writing or ending a response stream
* [ContentLength](./middleware/ContentLengthMiddleware.js) - Sets `Content-Length` based on response stream content writes
* [Hash](./middleware/HashMiddleware.js) - Sets `ETag`, `Digest`, and `Content-MD5` response headers automatically
* [ContentEncoder](./middleware/ContentEncoderMiddleware.js) - Applies `Content-Encoding` to response based on `Accept-Encoding` request header
* [SendJson](./middleware/SendJsonMiddleware.js) - Adds response content processor that encodes objects and arrays to JSON string. Sets `application/json;charset=utf-8`, if content-type not set.
* [SendString](./middleware/SendStringMiddleware.js) - Adds response content processor that encodes a string. Uses `charset` or uses `utf-8`, if not set.

### Request Middleware
* [ContentDecoder](/middleware/ContentDecoderMiddleware.js) - Decodes `Content-Encoding` from request streams

### Logic Middleware
* [Path](/middleware/PathMiddleware.js) - Creates logic filter based on URL pathname
* [Method](/middleware/MethodMiddleware.js) - Creates logic filter based on request method

### Other Middleware
* [CORS](/middleware/CORSMiddleware.js) - Handles preflight `OPTION` requests and sets necessary response headers for other methods


### Examples:

````js
HttpHandler.defaultInstance.middleware.push(
  new AutoHeadersMiddleware(),
  new ContentLengthMiddleware(),
  hash: (USE_HASH ? new HashMiddleware() : HttpHandler.CONTINUE),
);
HttpHandler.defaultInstance.middleware.push(
  [
    PathMiddleware.SUBPATH('/api'),
    new CORSMiddleware(),
    [MethodMiddleware.GET, myAPIGetFunctions],
    [MethodMiddleware.POST, myAPIPostFunctions],
  ],
  [
    new PathMiddleware(/^\/(index\.html?)?$/),
    indexPageMiddleware
  ],
  arrayToBePopulatedLater,
  404 // Equivalient of ({response}) => response.code(404).end()
);
HttpHandler.defaultInstance.errorHandlers.push({
  onError({error}) {
    console.error(error);
    return 500;
  },
});
````

## Custom Middleware


````js
async function checkToken({request, response, locals}) {
  const content = await req.read();
  try {
    const decoded = await decodeJWT(content.token);
    locals.jwt = decoded;
  } catch {
    return 401;
  }
  /**
   * Since we want the logic to continue to the next step,
   * We can either allow the function to implicitly return `undefined`
   * or explicitly use any of the following:
   *  * return undefined;
   *  * return true;
   *  * return HttpHandler.CONTINUE;
   */
}
````

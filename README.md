# webhoster

An opt-in, stream-based approach to Web Hosting with NodeJS.

* Supports HTTP
* Supports HTTPS
* Supports HTTP/2

#### Nothing is true; everything is permitted

By default, the framework does nothing. It parses no headers. It writes no header. It never writes to any stream. That is, unless you add middleware. All middleware is built to the maximum throughput and do as little as possible.

## install

`npm install webhoster`

## Quick Start

** Coming soon! ** 

For now, take a look at [/test/index.js](/test/index.js)

## Core

### [HttpHandler.js](/lib/HttpHandler.js)
*Class that handles the logic for handling requests and responses*

* `.defaultInstance` - (`HttpHandler`) - Returns a instance of `HttpHandler` that can be accessed staticly.
* `.preprocessors` - (`Middleware[]`) - An array of middleware to use when handling requests before running the main middleware collection. 
* `.middleware` - (`Set<Middleware>`) - A collection of middleware chains to iterate though when handling a request. It is recommended to create isolated chains (eg: `/images/`; `/api/`; `/views/`; etc.). The use of `Set` type is to avoid mistakenly inserting the same middleware chain twice.
* `.errorHandlers` - (`MiddlewareErrorHandler[]`) - An array of `MiddlewareErrorHandler` that will handle errors and respond appropriately (eg: `res.status = 500`)
* `.handleRequest` - (`function(MiddlewareFunctionParams):Promise<HttpResponse>`) - handles logic for calling preprocessors, middleware, and error handlers. Unlikely to be used directly.
* `.handleHttp1Request` - (`function(IncomingMessage, ServerResponse):Promise<HttpResponse>`) - constructs a new `HttpRequest` and `HttpResponse` based on the HTTP1 parameters and passes it to `handleRequest`
* `.handleHttp2Stream` - (`function(ServerHttp2Stream, IncomingHttpHeaders, HttpResponseOptions):Promise<HttpResponse>`) - constructs a new `HttpRequest` and `HttpResponse` based on the HTTP2 parameters and passes it to `handleRequest`

### Example

````js
  HttpHandler.defaultInstance.preprocessors.push([
    defaultSendHeadersMiddleware,
    defaultContentLengthMiddleware,
    defaultHashMiddleware,
    defaultContentEncoderMiddleware,
    defaultContentDecoderMiddleware,
    createContentWriterMiddleware({ setCharset: true, setJSON: true }),
    createContentReaderMiddleware({ buildString: true, parseJSON: true }),
  ]);
  HttpHandler.defaultInstance.middleware.add(imagesMiddleware);
  HttpHandler.defaultInstance.middleware.add(return404Middleware);
  HttpHandler.errorHandlers.push([
    errorLoggerMiddleware,
    return500Middlware
  ]);
  http1Server.addListener('request', HttpHandler.defaultInstance.handleHttp1Request);
  http2Server.addListener('stream', HttpHandler.defaultInstance.handleHttp2Stream);
````

### [HttpRequest.js](/lib/HttpRequest.js)
*Class that provides the bare-minimum to bridge different protocols for client requests*

* `.stream` - (`Readable`) - This is generally how you will read content inside client requests. With no middleware, it emits a `Buffer`. But if are using an Object Mode middleware like `contentReader.js`, events may emit an `Object` or `string`.
* `.headers` - (`IncomingHttpHeaders`) - The response headers exactly as presented to the NodeJS Server with no modifications.
* `.locals` - (`Object<string,any>`) - Object that gets passed in every step of the middleware chain. Application-level variables *should* be presented here.
* `.replaceStream()` - (`function(stream:Readable):Readable`) - replaces the current stream with a new stream. Used by high-level middleware for the purpose of transforming data (eg: JSON-parsing).

### Example

````js
async function onPostComment({req, res}) {
  const content = (await req.stream[Symbol.asyncIterator]().next()).value;
  let comment;
  try {
    comment = new UserComment(content);
  } catch {
    res.status = 400;
    return 'end';
  }
  try {
    await insertComment(comment);
  } catch {
    res.status = 500;
    return 'end';
  }
  res.status = 200;
  res.stream.end({status: 'OK'});
  return 'end';
}
````

### [HttpResponse.js](/lib/HttpResponse.js)
*Class that provides the bare-minimum to bridge different protocols for client responses*

* `.stream` - (`Writable`) - This is generally how you will return payloads in your custom middleware. It's recommended to use `.end(payload)` unless you are sending things in chunks with `.write()`. `.pipe()` is also supported. With no middleware, it accepts a `Buffer` or `string`. But if are using an Object Mode middleware like `contentWriter.js`, then you can pass an `Object` that can transform the object to JSON and set the appropriate headers automatically.
* `.headers` - (`OutgoingHttpHeaders`) - The response headers exactly as presented to the NodeJS Server with no modifications.
* `.status` - (`number`) - The response status
* `.locals` - (`Object<string,any>`) - Object that gets passed in every step of the middleware chain. Application-level variables *should* be presented here.
* `.replaceStream()` - (`function(stream:Writable):Writable`) - replaces the current stream with a new stream. Used by high-level middleware for the purpose of transforming data, or analyzing data to modify response headers. (eg: zlib compression, hashing, content-length).
* `.canPushPath` - (`boolean`) - `true` on HTTP/2 streams that support push
* `.pushPath` - (`function(path:string):Promise`) - Push a new HTTP/2 stream simulating a request for `path`

### Example

````js
async function onGetIndexPage({res}) {
  const indexHTML = await getIndexPage();
  res.status = 200;
  if (res.canPushPath) {
    res.pushPath('/script.js');
    res.pushPath('/styles.css');
  }
  res.stream.end(indexHTML);
  return 'end';
}
````

## Middleware

#### MiddlewareFunction

Middleware logic flows in a tree structure, allowing for `break`, `end`, or `continue`.

A `MiddlewareFunction` is a function that accepts a `MiddlewareFunctionParams` object structured as `{ res: HttpRequest, res: HttpResponse }`. The function must return a instruction as to proceed with the current step in tree-based logic. It maybe return any of these instructions with any of the values as a literal or a `Promise`:

* End: Terminates the entire middleware chain. `values: 'end'`
* Continue: Continues on the current chain to the next middleware, or moves to the next chain if there are no siblings left. `values: 'continue'|void|null|undefined`
* Break: Breaks from the current middleware chain, and continues to the next chain. `values: 'break'`

A `MiddlewareFilter` is a function that accepts a `MiddlewareFunctionParams` and returns a `MiddlewareContinueBoolean` or `Promise<MiddlewareContinueBoolean>` signaling whether to continue in the chain. `true` means to `continue`. `false` means to `break`. There is no support for `end` logic in a MiddlewareFilter.

A `MiddlewareErrorHandler` is an `Object` with a `onError` property. `onError` is like a MiddlewareFunction, but includes an `err` item in its parameter object. When the handler is in an error state, it will bubble upwards while search for the next `MiddlewareErrorHandler`.

`Middleware` can be a `MiddlewareFunction` or `MiddlewareFilter`. It can also a compatible response value of either: `'continue'|true|null|void|undefined`, `'break'|false`, `'end'`. The response can be the value or a `Promise`.

To support branching, `Middleware` can also be a `Iterable<Middleware>` (include `Array` or `Set`), `Map<any, Middleware>` or `Object<string, Middleware>`. The `HttpHandler` will iterate through each and flow based on the `break`, `continue`, or `end` instruction return by each entry.

## Included Middleware

### Response Middleware
* [sendHeaders.js](/middleware/sendHeaders.js) - Automatically send response headers when before writing or ending a response stream
* [contentLength.js](/middleware/contentLength.js) - Sets `Content-Length` based on response stream content writes
* [hash.js](/middleware/hash.js) - Sets `ETag`, `Digest`, and `Content-MD5` response headers automatically
* [contentEncoder.js](/middleware/contentEncoder.js) - Applies `Content-Encoding` to response based on 'Accept-Encoding` request header
* [contentWriter.js](/middleware/contentWriter.js) - Adds `Object Mode` write support to response stream, including `string` and `JSON` support

### Request Middleware
* [contentDecoder.js](/middleware/contentDecoder.js) - Decodes `Content-Encoding` from request streams
* [contentReader.js](/middleware/contentReader.js) - Adds `Object Mode` read support to request stream, include `string`, `JSON`, and `urlencoded` support. Can cache transformation into `req.local` for convenience.

### Other Middleware
* [cors.js](/middleware/cors.js) - Handles preflight `OPTION` requests and sets necessary response headers for other methods

### Logic Middleware
* [pathFilter.js](/middleware/pathFilter.js) - Creates logic filter based on URL pathname
* [methodFilter.js](/middleware/methodFilter.js) - Creates logic filter based on request method

### Examples:

````js
HttpHandler.defaultInstance.preprocessors.push({
  // This is an object with names for each entry
  sendHeaders: defaultSendHeadersMiddleware,
  contentLength: defaultContentLengthMiddleware,
  hash: (USE_HASH ? defaultHashMiddleware : 'continue'),
});
HttpHandler.defaultInstance.middleware.add([
  createPathRelativeFilter('/api/'),
  defaultCORSMiddleware,
  [createMethodFilter('GET'), myAPIGetFunctions],
  [createMethodFilter('POST'), myAPIGetFunctions],
]);
HttpHandler.defaultInstance.middleware.add([
  createPathRegexFilter('^/(index.html?)?$'),
  indexPageMiddleware,
  'end',
]);
HttpHandler.defaultInstance.middleware.add(arrayToBePopulatedLater);
HttpHandler.defaultInstance.middleware.add((({ res }) => { res.status = 404; return 'end'; }));
HttpHandler.defaultInstance.errorHandlers.push({
  onError({ res, err }) {
    console.error(err);
    res.status = 500;
    return 'end';
  },
});
````

## Custom Middleware


````js
async function checkToken({req, res}) {
  const content = (await req.stream[Symbol.asyncIterator]().next()).value;
  req.locals.content = content;
  try {
    const decoded = await decodeJWT(content.token);
    req.locals.jwt = decoded;
    delete req.locals.content.token;
  } catch {
    res.status = 401;
    return 'end';
  }
  return 'continue'
}
````
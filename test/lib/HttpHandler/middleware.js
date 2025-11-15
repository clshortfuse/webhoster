import * as http from 'node:http';

import test from 'ava';

import HttpListener from '../../../helpers/HttpListener.js';
import HttpHandler from '../../../lib/HttpHandler.js';

test('HttpHandler.handleRequest() via HttpListener HTTP/1 server', async (t) => {
  // Create a handler with simple middleware
  const handler = new HttpHandler({
    middleware: [
      ({ response }) => {
        response.status = 200;
        response.headers['content-type'] = 'text/plain';
        return 'hello world';
      },
    ],
  });
  // Start a real HTTP/1 server using HttpListener
  const listener = new HttpListener({
    insecurePort: 0,
    httpHandler: handler,
  });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  // Make a request to the server
  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.headers['content-type'], 'text/plain');
  t.is(res.body, 'hello world');

  await listener.stopHttpServer();
});

test('HttpHandler array middleware with BREAK and END flow', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      [
        ({ response }) => {
          response.status = 201;
          response.headers['x-branch'] = 'first';
          return HttpHandler.BREAK;
        },
        ({ response }) => {
          response.headers['x-branch'] = 'should-not-run';
          return HttpHandler.END;
        },
      ],
      ({ response }) => {
        response.headers['x-final'] = 'ran';
        return 'branch done';
      },
    ],
  });
  const listener = new HttpListener({
    insecurePort: 0,
    httpHandler: handler,
  });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 201);
  t.is(res.headers['x-branch'], 'first');
  t.is(res.headers['x-final'], 'ran');
  t.is(res.body, 'branch done');

  await listener.stopHttpServer();
});

test('HttpHandler string middleware returns string as body', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      'direct string',
    ],
  });
  const listener = new HttpListener({
    insecurePort: 0,
    httpHandler: handler,
  });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'direct string');

  await listener.stopHttpServer();
});

test('HttpHandler error handler middleware is called on error', async (t) => {
  let errorHandled = false;
  const handler = new HttpHandler({
    middleware: [
      function errorThrower() { throw new Error('fail'); },
    ],
    errorHandlers: [
      {
        onError: (tx) => {
          t.truthy(tx.error);
          if (!tx.error) {
            t.fail('tx.error should not be null');
            return 500;
          }
          errorHandled = true;
          tx.response.status = 500;
          tx.response.headers['content-type'] = 'text/plain';
          return `error: ${tx.error.message}`;
        },
      },
    ],
  });
  const listener = new HttpListener({
    insecurePort: 0,
    httpHandler: handler,
  });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 500);
  t.is(res.headers['content-type'], 'text/plain');
  t.true(res.body.startsWith('error: fail'));
  t.true(errorHandled);

  await listener.stopHttpServer();
});

test('HttpHandler promise middleware resolves and returns value', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      ({ response }) => {
        response.status = 200;
        response.headers['content-type'] = 'text/plain';
        return Promise.resolve('async value');
      },
    ],
  });
  const listener = new HttpListener({
    insecurePort: 0,
    httpHandler: handler,
  });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'async value');

  await listener.stopHttpServer();
});

test('HttpHandler handles malformed request gracefully', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      ({ response }) => {
        response.status = 200;
        response.headers['content-type'] = 'text/plain';
        return 'ok';
      },
    ],
    errorHandlers: [
      {
        onError: (tx) => {
          tx.response.status = 400;
          tx.response.headers['content-type'] = 'text/plain';
          return 'malformed';
        },
      },
    ],
  });
  const listener = new HttpListener({
    insecurePort: 0,
    httpHandler: handler,
  });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  // Simulate a malformed request by closing the socket early
  const net = await import('node:net');
  await new Promise((resolve) => {
    const client = net.createConnection({ port, host: '127.0.0.1' }, () => {
      client.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
      client.end();
      resolve();
    });
  });

  // Make a valid request to ensure server is still alive
  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'ok');

  await listener.stopHttpServer();
});

test('HttpHandler object middleware with .execute property', async (t) => {
  const middlewareObj = {
    execute(tx) {
      tx.response.status = 200;
      tx.response.headers['content-type'] = 'text/plain';
      return 'executed';
    },
  };
  const handler = new HttpHandler({ middleware: [middlewareObj] });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'executed');

  await listener.stopHttpServer();
});

test('HttpHandler object middleware with .Execute static property', async (t) => {
  const middlewareObj = {
    Execute(tx) {
      tx.response.status = 201;
      tx.response.headers['content-type'] = 'text/plain';
      return 'static executed';
    },
  };
  const handler = new HttpHandler({ middleware: [middlewareObj] });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 201);
  t.is(res.body, 'static executed');

  await listener.stopHttpServer();
});

test('HttpHandler promise-like object middleware (.then)', async (t) => {
  const promiseLike = {
    then(resolve) {
      resolve('promise-like value');
    },
  };
  const handler = new HttpHandler({ middleware: [promiseLike] });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'promise-like value');

  await listener.stopHttpServer();
});

test('HttpHandler number middleware sets status code', async (t) => {
  const handler = new HttpHandler({ middleware: [404] });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 404);
  t.is(res.body, '');

  await listener.stopHttpServer();
});

test('HttpHandler array middleware CONTINUE, BREAK, END E2E', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      [
        HttpHandler.CONTINUE,
        true,
        null,
        undefined,
        () => HttpHandler.CONTINUE,
        [
          () => HttpHandler.BREAK,
          500,
        ],
        [
          async () => await Promise.resolve(HttpHandler.BREAK),
          500,
        ],
        [
          false,
          500,
        ],
        [
          function test2() { return function inner() { return false; }; },
          500,
        ],
        [
          Promise.resolve(false),
          500,
        ],
        ({ response }) => {
          response.status = 210;
          response.headers['x-flow'] = 'continue';
          return 'continued';
        },
      ],
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 210);
  t.is(res.headers['x-flow'], 'continue');
  t.is(res.body, 'continued');

  await listener.stopHttpServer();
});

test('HttpHandler array middleware BREAK E2E', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      [
        () => HttpHandler.BREAK,
        ({ response }) => {
          response.status = 211;
          response.headers['x-flow'] = 'should-not-run';
          return 'should not run';
        },
      ],
      ({ response }) => {
        response.status = 212;
        response.headers['x-flow'] = 'break';
        return 'break ran';
      },
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 212);
  t.is(res.headers['x-flow'], 'break');
  t.is(res.body, 'break ran');

  await listener.stopHttpServer();
});

test('HttpHandler array middleware END E2E', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      [
        false,
        ({ response }) => {
          response.status = 213;
          response.headers['x-flow'] = 'should-not-run';
          return 'should not run';
        },
      ],
      ({ response }) => {
        response.status = 214;
        response.headers['x-flow'] = 'end';
        response.body = 'end ran';
      },
      HttpHandler.END,
      ({ response }) => {
        response.status = 215;
        response.headers['x-flow'] = 'should-not-run2';
        return 'should not run';
      },
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 214);
  t.is(res.headers['x-flow'], 'end');
  t.is(res.body, 'end ran');

  await listener.stopHttpServer();
});

test('HttpHandler array middleware with promise-like (.then) E2E', async (t) => {
  const promiseLike = {
    then(resolve) {
      resolve('promise-array-value');
    },
  };
  const handler = new HttpHandler({
    middleware: [
      [promiseLike],
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'promise-array-value');

  await listener.stopHttpServer();
});

test('HttpHandler does not call next middleware after error', async (t) => {
  let nextCalled = false;
  const handler = new HttpHandler({
    middleware: [
      function errorThrower() { throw new Error('fail'); },
      () => { nextCalled = true; return 'should not run'; },
    ],
    errorHandlers: [
      {
        onError: (tx) => {
          tx.response.status = 500;
          tx.response.headers['content-type'] = 'text/plain';
          return 'error handled';
        },
      },
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 500);
  t.is(res.body, 'error handled');
  t.false(nextCalled, 'Next middleware should not be called after error');

  await listener.stopHttpServer();
});

test('HttpHandler calls inline error handler in middleware', async (t) => {
  let inlineErrorCalled = false;
  let defaultErrorCalled = false;
  const handler = new HttpHandler({
    middleware: [
      function errorThrower() { throw new Error('fail'); },
      {
        onError(tx) {
          inlineErrorCalled = true;
          tx.response.status = 501;
          tx.response.headers['content-type'] = 'text/plain';
          return 'inline error';
        },
      },
    ],
    errorHandlers: [
      {
        onError: (tx) => {
          defaultErrorCalled = true;
          tx.response.status = 502;
          tx.response.headers['content-type'] = 'text/plain';
          console.log('default error handler called');
          return 'default error';
        },
      },
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  // Trigger error to hit inline error handler
  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 501);
  t.is(res.body, 'inline error');
  t.true(inlineErrorCalled, 'Inline error handler should be called');
  t.false(defaultErrorCalled, 'Default error handler should not be called');

  await listener.stopHttpServer();
});

test('HttpHandler clears error on sync onError', async (t) => {
  let errorCleared = false;
  const handler = new HttpHandler({
    middleware: [
      function errorThrower() { throw new Error('fail'); },
      {
        onError: (tx) => {
          if (tx.error == null) t.fail('tx.error should not be null');
          tx.response.status = 503;
          tx.response.headers['content-type'] = 'text/plain';
          tx.response.body = 'sync error cleared';
        },
      },
      (tx) => {
        errorCleared = tx.error == null;
      },
      200,
    ],
    errorHandlers: [],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'sync error cleared');
  t.true(errorCleared, 'Error should be cleared after sync onError');

  await listener.stopHttpServer();
});

test('HttpHandler clears error on async onError', async (t) => {
  let errorCleared = false;
  const handler = new HttpHandler({
    middleware: [
      function errorThrower() { throw new Error('fail'); },
      {
        onError: async (tx) => {
          await new Promise((r) => setTimeout(r, 10));
          tx.response.status = 500;
          tx.response.headers['content-type'] = 'text/plain';
          tx.response.body = 'async error cleared';
        },
      },
      (tx) => {
        errorCleared = tx.error == null;
      },
      200,
    ],
    errorHandlers: [],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'async error cleared');
  t.true(errorCleared, 'Error should be cleared after async onError');

  await listener.stopHttpServer();
});

test('HttpHandler clears error on promise-returning onError', async (t) => {
  let errorCleared = false;
  const handler = new HttpHandler({
    middleware: [
      function errorThrower() { throw new Error('fail'); },
      {
        onError: (tx) => new Promise((resolve) => {
          setTimeout(() => {
            tx.response.status = 500;
            tx.response.headers['content-type'] = 'text/plain';
            tx.response.body = 'promise error cleared';
            resolve();
          }, 10);
        }),
      },
      (tx) => {
        errorCleared = tx.error == null;
      },
      200,
    ],
    errorHandlers: [],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'promise error cleared');
  t.true(errorCleared, 'Error should be cleared after promise-returning onError');

  await listener.stopHttpServer();
});

test('HttpHandler clears error before sibling middleware after onError', async (t) => {
  let errorWasPresentInOnError = false;
  let errorWasClearedInSibling = false;
  const handler = new HttpHandler({
    middleware: [
      function errorThrower() { throw new Error('fail'); },
      {
        onError: (tx) => {
          errorWasPresentInOnError = tx.error instanceof Error;
          tx.response.status = 500;
          // Assume error was handled here
        },
      },
      (tx) => {
        errorWasClearedInSibling = tx.error == null;
        tx.response.status = 200;
        return 'sibling ran';
      },
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'sibling ran');
  t.true(errorWasPresentInOnError, 'Error should be present inside onError handler');
  t.true(errorWasClearedInSibling, 'Error should be cleared before sibling middleware runs');

  await listener.stopHttpServer();
});

test('HttpHandler does not call onError if no error occurs', async (t) => {
  let onErrorCalled = false;
  const handler = new HttpHandler({
    middleware: [
      (tx) => {
        tx.response.status = 200;
        tx.response.body = 'no error';
      },
      {
        onError: () => {
          onErrorCalled = true;
        },
      },
      200,
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.body, 'no error');
  t.false(onErrorCalled, 'onError should NOT be called if there is no error');

  await listener.stopHttpServer();
});

test('HttpHandler throws if middleware returns negative status code', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      -404,
    ],
    errorHandlers: [
      {
        onError: () => 502,
      },
    ],

  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 502);

  await listener.stopHttpServer();
});

test('HttpHandler middleware can send back Buffer as body', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      ({ response }) => {
        response.status = 200;
        response.headers['content-type'] = 'application/octet-stream';
        return Buffer.from('ok');
      },
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = Buffer.alloc(0);
      response.on('data', (chunk) => { data = Buffer.concat([data, chunk]); });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.headers['content-type'], 'application/octet-stream');
  t.true(Buffer.isBuffer(res.body));
  t.is(res.body.toString(), 'ok');

  await listener.stopHttpServer();
});

test('HttpHandler middleware can send back Uint8Array as body', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      ({ response }) => {
        response.status = 200;
        response.headers['content-type'] = 'application/octet-stream';
        return new Uint8Array([111, 107]); // 'ok'
      },
    ],
  });
  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    http.get({ port, path: '/', hostname: '127.0.0.1' }, (response) => {
      let data = Buffer.alloc(0);
      response.on('data', (chunk) => { data = Buffer.concat([data, chunk]); });
      response.on('end', () => {
        resolve({ status: response.statusCode, headers: response.headers, body: data });
      });
    }).on('error', reject);
  });

  t.is(res.status, 200);
  t.is(res.headers['content-type'], 'application/octet-stream');
  t.true(Buffer.isBuffer(res.body));
  t.is(res.body.toString(), 'ok');

  await listener.stopHttpServer();
});

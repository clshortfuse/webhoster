import * as http from 'node:http';
import test from 'ava';

import HttpListener from '../../helpers/HttpListener.js';
import HttpHandler from '../../lib/HttpHandler.js';
import ReadFormData from '../../middleware/ReadFormData.js';
import SendJsonMiddleware from '../../middleware/SendJsonMiddleware.js';
import PolyfillFormData from '../../polyfill/FormData.js';

const originalFormData = globalThis.FormData;

test.before(() => {
  if (!globalThis.FormData) {
    globalThis.FormData = PolyfillFormData;
  }
});

test.after.always(() => {
  if (originalFormData === undefined) {
    delete globalThis.FormData;
  } else {
    globalThis.FormData = originalFormData;
  }
});

test('new ReadFormData()', (t) => {
  const instance = new ReadFormData();
  t.assert(instance instanceof ReadFormData);
  t.is(typeof instance.execute, 'function');
});

test('ReadFormData: middleware setup with .execute', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      async ({ request }) => {
        t.is(typeof request.formData, 'function');
        t.true(request.contentReaders.length > 0);
        const lastReader = request.contentReaders.at(-1);
        t.is(lastReader.type, 'application');
        t.is(lastReader.subtype, 'x-www-form-urlencoded');
        return 'ok';
      },
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, resolve);
    req.on('error', reject);
    req.end('');
  });

  await listener.stopHttpServer();
});

test('ReadFormData: middleware setup with static .Execute', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      { Execute: ReadFormData.Execute },
      async ({ request }) => {
        t.is(typeof request.formData, 'function');
        t.true(request.contentReaders.length > 0);
        return 'ok';
      },
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, resolve);
    req.on('error', reject);
    req.end('');
  });

  await listener.stopHttpServer();
});

test('ReadFormData: parses simple form data via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => {
        const data = await request.read();
        return data;
      },
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data, status: response.statusCode }));
    });
    req.on('error', reject);
    req.end('name=John&age=30');
  });

  t.is(res.status, 200);
  const parsed = JSON.parse(res.body);
  t.deepEqual(parsed, { name: 'John', age: '30' });

  await listener.stopHttpServer();
});

test('ReadFormData: parses form data with URL-encoded values via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('name=John+Doe&email=test%40example.com&message=Hello%20World%21');
  });

  const parsed = JSON.parse(res.body);
  t.deepEqual(parsed, {
    name: 'John Doe',
    email: 'test@example.com',
    message: 'Hello World!',
  });

  await listener.stopHttpServer();
});

test('ReadFormData: parses form data with empty values via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('name=&age=30&city=');
  });

  const parsed = JSON.parse(res.body);
  t.deepEqual(parsed, { name: '', age: '30', city: '' });

  await listener.stopHttpServer();
});

test('ReadFormData: parses form data with no equals sign via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('name&age=30');
  });

  const parsed = JSON.parse(res.body);
  t.deepEqual(parsed, { name: '', age: '30' });

  await listener.stopHttpServer();
});

test('ReadFormData: parses form data with special characters via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('text=%3Cscript%3Ealert%28%27xss%27%29%3C%2Fscript%3E');
  });

  const parsed = JSON.parse(res.body);
  t.deepEqual(parsed, { text: '<script>alert(\'xss\')</script>' });

  await listener.stopHttpServer();
});

test('ReadFormData: handles empty form data via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('');
  });

  const parsed = JSON.parse(res.body);
  t.deepEqual(parsed, {});

  await listener.stopHttpServer();
});

test('ReadFormData: handles multiple ampersands via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('name=John&&age=30&&&city=NYC');
  });

  const parsed = JSON.parse(res.body);
  t.deepEqual(parsed, { name: 'John', age: '30', city: 'NYC' });

  await listener.stopHttpServer();
});

test('ReadFormData: formData() method returns FormData via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => {
        const formData = await request.formData();
        return {
          name: formData.get('name'),
          age: formData.get('age'),
        };
      },
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('name=John&age=30');
  });

  const parsed = JSON.parse(res.body);
  t.is(parsed.name, 'John');
  t.is(parsed.age, '30');

  await listener.stopHttpServer();
});

test('ReadFormData: formData() throws for unsupported media type via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => {
        try {
          await request.formData();
          return { error: false };
        } catch (error) {
          return { error: true, message: error.message };
        }
      },
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('{}');
  });

  const parsed = JSON.parse(res.body);
  t.true(parsed.error);
  t.is(parsed.message, 'UNSUPPORTED');

  await listener.stopHttpServer();
});

test('ReadFormData: handles plus signs as spaces via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('name=John+Doe&message=Hello+World');
  });

  const parsed = JSON.parse(res.body);
  t.is(parsed.name, 'John Doe');
  t.is(parsed.message, 'Hello World');

  await listener.stopHttpServer();
});

test('ReadFormData: parses UTF-8 encoded values via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('emoji=%F0%9F%98%80&text=Caf%C3%A9');
  });

  const parsed = JSON.parse(res.body);
  t.is(parsed.emoji, '😀');
  t.is(parsed.text, 'Café');

  await listener.stopHttpServer();
});

test('ReadFormData: handles multiple equals signs in value via middleware', async (t) => {
  const handler = new HttpHandler({
    middleware: [
      new ReadFormData(),
      new SendJsonMiddleware(),
      async ({ request }) => await request.read(),
    ],
  });

  const listener = new HttpListener({ insecurePort: 0, httpHandler: handler });
  const server = await listener.startHttpServer();
  const address = server.address();
  const port = typeof address === 'object' && address && 'port' in address ? Number(address.port) : Number(address);

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      port,
      path: '/',
      hostname: '127.0.0.1',
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ body: data }));
    });
    req.on('error', reject);
    req.end('equation=a%3Db%3Dc');
  });

  const parsed = JSON.parse(res.body);
  t.is(parsed.equation, 'a=b=c');

  await listener.stopHttpServer();
});

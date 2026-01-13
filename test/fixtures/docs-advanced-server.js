import { start } from 'webhoster/templates/starter.js';
import PathMiddleware from 'webhoster/middleware/PathMiddleware.js';
import MethodMiddleware from 'webhoster/middleware/MethodMiddleware.js';
import CORSMiddleware from 'webhoster/middleware/CORSMiddleware.js';
import HttpListener from 'webhoster/helpers/HttpListener.js';

import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory buffer map for chunked upload sessions
const sessionMap = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000;
const SESSION_MAX_BYTES = 50 * 1024 * 1024;

function getHeader(request, key) {
  const headers = request.headers;
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(key) ?? headers.get(key.toLowerCase());
  return headers[key] ?? headers[key.toLowerCase()];
}

/** @type {import('webhoster/data/custom-types.js').Middleware[]} */
const middleware = [
  [
    PathMiddleware.SUBPATH('/api'),
    new CORSMiddleware(),

    // Example JSON endpoint
    [
      PathMiddleware.SUBPATH('/echo'),
      MethodMiddleware.POST,
      async ({ request }) => {
        const body = await request.read();
        return { ok: true, received: body };
      },
    ],

    // Example SSE endpoint
    [
      PathMiddleware.SUBPATH('/stream'),
      MethodMiddleware.GET,
      async ({ response }) => {
        response.headers['content-type'] = 'text/event-stream; charset=utf-8';
        async function* sse() {
          for (let i = 0; i < 3; i += 1) {
            yield `data: ${JSON.stringify({ tick: i })}\n\n`;
            await new Promise((r) => setTimeout(r, 500));
          }
          yield 'event: end\ndata: {}\n\n';
        }
        return sse();
      },
    ],

    // Example binary response endpoint
    [
      PathMiddleware.SUBPATH('/binary'),
      MethodMiddleware.GET,
      async ({ response }) => {
        response.headers['content-type'] = 'application/octet-stream';
        return Buffer.from('hello');
      },
    ],

    // Chunked upload endpoint
    [
      PathMiddleware.SUBPATH('/upload'),
      MethodMiddleware.POST,
      async ({ request }) => {
        const buffer = Buffer.from(await request.arrayBuffer());
        const sessionId = getHeader(request, 'x-session');
        const chunkIndexRaw = getHeader(request, 'x-chunk-index');
        const isFinal = String(getHeader(request, 'x-final') || '').toLowerCase() === 'true';

        if (!sessionId || chunkIndexRaw == null) {
          // One-shot upload
          return { ok: true, bytes: buffer.length };
        }

        const chunkIndex = Number(chunkIndexRaw);
        if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
          return { error: 'Invalid x-chunk-index header' };
        }

        const safeId = String(sessionId).replaceAll(/[^a-zA-Z0-9-_]/g, '_');
        let entry = sessionMap.get(safeId);
        if (!entry) {
          entry = {
            parts: [],
            totalBytes: 0,
            timeout: null,
          };
        }
        if (entry.timeout) clearTimeout(entry.timeout);
        entry.timeout = setTimeout(() => sessionMap.delete(safeId), SESSION_TTL_MS);

        entry.parts.push({ index: chunkIndex, buf: buffer });
        entry.totalBytes += buffer.length;
        if (entry.totalBytes > SESSION_MAX_BYTES) {
          if (entry.timeout) clearTimeout(entry.timeout);
          sessionMap.delete(safeId);
          return { error: 'Session exceeded maximum size' };
        }
        sessionMap.set(safeId, entry);

        if (!isFinal) return { ok: true, stored: chunkIndex };

        // Assemble in order
        const ordered = [...entry.parts].sort((a, b) => a.index - b.index);
        const assembled = Buffer.concat(ordered.map((p) => p.buf));
        if (entry.timeout) clearTimeout(entry.timeout);
        sessionMap.delete(safeId);

        return { ok: true, bytes: assembled.length };
      },
    ],
  ],

  // Static file serving branch
  [
    async ({ request, response }) => {
      const p = request.pathname === '/' || request.pathname === '/index.html'
        ? '/index.html'
        : request.pathname;
      const filePath = path.join(__dirname, 'public', decodeURIComponent(p.replace(/^\//, '')));
      try {
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        if (!exists) return 404;

        const extension = path.extname(filePath).toLowerCase();
        const mime = extension === '.js'
          ? 'application/javascript'
          : extension === '.css'
            ? 'text/css'
            : extension === '.html'
              ? 'text/html'
              : 'application/octet-stream';

        response.headers['content-type'] = mime;
        return fs.readFile(filePath);
      } catch {
        return 404;
      }
    },
  ],

  // Fallback
  [
    async ({ request }) => {
      console.warn(`Unhandled request: ${request.method} ${request.pathname}`);
      return 404;
    },
  ],
];

const errorHandlers = [
  {
    onError: (error, context) => {
      try {
        console.error('Unhandled error:', error && error.stack ? error.stack : error);
        if (context?.request) {
          console.error('Request:', context.request.method, context.request.pathname);
        }
      } catch { }
      return 500;
    },
  },
];

export async function startServer({ host = '127.0.0.1', port = 0 } = {}) {
  await start({ host, port, middleware, errorHandlers });
  return HttpListener.defaultInstance;
}

export async function stopServer() {
  await HttpListener.defaultInstance.stopAll();
}

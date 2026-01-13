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

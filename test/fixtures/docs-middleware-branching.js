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

import {
  IMiddleware,
  MiddlewareFunction,
  MiddlewareErrorHandler,
  MiddlewareContinueBoolean,
} from './index.js';

export type Middleware = MiddlewareFunction
  | IMiddleware
  | MiddlewareErrorHandler
  | Iterable<Middleware>
  | Map<any, Middleware>
  | {[key:string]: Middleware, onError?: undefined}
  | MiddlewareContinueBoolean
  | 'end'|'break'|'continue'|null|undefined|void;

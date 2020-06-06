import {
  MiddlewareFunction,
  MiddlewareFilter,
  MiddlewareErrorHandler,
  MiddlewareContinueBoolean
} from './index.js';

export type Middleware = MiddlewareFunction
  | MiddlewareFilter
  | MiddlewareErrorHandler
  | Iterable<Middleware>
  | Map<any, Middleware>
  | {[key:string]: Middleware, onError?: undefined}
  | MiddlewareContinueBoolean
  | 'end'|'break'|'continue'|null|undefined;


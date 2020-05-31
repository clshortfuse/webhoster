import { MiddlewareFunction, MiddlewareFilter,MiddlewareErrorHandler } from './index.js';

export type Middleware = MiddlewareFunction
  | MiddlewareFilter
  | MiddlewareErrorHandler
  | Iterable<Middleware>
  | Map<any, Middleware>
  | {[key:string]: Middleware, onError?: undefined}
  | boolean
  | 'end'|'break'|'continue'|null|undefined;


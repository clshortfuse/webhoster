/** @typedef {import('./types/index').MiddlewareFunction} MiddlewareFunction */
/** @typedef {import('./types/index').MiddlewareFilter} MiddlewareFilter */
/** @typedef {import('./types/index').MiddlewareErrorHandler} MiddlewareErrorHandler */

export type Middleware = MiddlewareFunction
  | MiddlewareFilter
  | MiddlewareErrorHandler
  | Iterable<Middleware>
  | Map<any, Middleware>
  | {[key:string]: Middleware, onError?: undefined}
  | boolean
  | 'end'|'break'|'continue'|null|undefined;


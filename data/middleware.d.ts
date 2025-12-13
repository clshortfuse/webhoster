import {
  IMiddleware,
  MiddlewareContent,
  MiddlewareFunction,
  MiddlewareFunctionResultType,
} from './custom-types.js';

export type Middleware =
  | IMiddleware
  | MiddlewareFunction
  | Middleware[]
  | MiddlewareContent
  | Set<Middleware>
  | MiddlewareFunctionResultType

import {
  IMiddleware,
  MiddlewareContent,
  MiddlewareFunction,
  MiddlewareFunctionResultType,
} from './index.js';

export type Middleware =
  | IMiddleware
  | MiddlewareFunction
  | Middleware[] 
  | MiddlewareContent
  | Set<Middleware>
  | MiddlewareFunctionResultType

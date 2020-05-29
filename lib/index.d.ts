import { MiddlewareFunction } from "./RequestHandler.js";

type Middleware = MiddlewareFunction
  | Iterable<Middleware>
  | Iterable<[string, Middleware]>
  | {[key:string]: Middleware};



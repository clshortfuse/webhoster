import { MiddlewareFunction } from "./RequestHandler.js";

type Middleware = MiddlewareFunction
  | Iterable<Middleware>
  | Map<any, Middleware>
  | {[key:string]: Middleware}
  | 'end'|'break'|'continue'|null|undefined;


import { MiddlewareFunction } from "./RequestHandler.js";
import { MiddlewareFilter } from "./RequestHandler.js";

type Middleware = MiddlewareFunction
  | MiddlewareFilter
  | Iterable<Middleware>
  | Map<any, Middleware>
  | {[key:string]: Middleware}
  | boolean
  | 'end'|'break'|'continue'|null|undefined;


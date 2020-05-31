/**
 * @param {RequestMethod[]} methods
 * @return {MiddlewareFilter}
 */
export function createMethodFilter(...methods) {
  return function methodFilter({ req }) {
    return methods.some((method) => method.toUpperCase() === req.method);
  };
}

/**
 * @param {RequestMethod|RegExp} method
 * @return {MiddlewareFilter}
 */
export function createMethodRegexFilter(method) {
  const pathRegex = (typeof method === 'string') ? RegExp(method, 'i') : method;
  return function methodFilter({ req }) {
    return pathRegex?.test(req.method) === true;
  };
}

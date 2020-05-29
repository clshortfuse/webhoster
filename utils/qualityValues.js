/** @typedef {{q:number?} & {[key:string]:string}} ParsedQualityValues */

/**
 * @param {string} input
 * @return {Map<string, ParsedQualityValues>}
 */
export function parseQualityValues(input) {
  if (!input || !input.trim()) {
    return new Map();
  }
  const tupleArray = input
    .split(',')
    .map((values) => {
      const [value, ...specifiers] = values.split(';');
      return /** @type {[string, ParsedQualityValues]} */ ([
        value.trim(),
        {
          ...Object.assign({}, ...specifiers.map((pair) => {
            const [specifier, sValue] = pair.split('=');
            const trimmedSpec = specifier?.trim();
            const trimmedSValue = sValue?.trim();
            if (trimmedSpec === 'q') {
              const parsedQ = parseFloat(trimmedSValue);
              return { q: Number.isNaN(parsedQ) ? 1 : parsedQ };
            }
            return { [trimmedSpec]: trimmedSValue };
          })),
        },
      ]);
    }).sort((a, b) => (b?.[1]?.q ?? 1) - (a?.[1]?.q ?? 1));
  return new Map(tupleArray);
}

export function noop() {}

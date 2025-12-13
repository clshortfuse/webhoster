/**
 *
 * @param {?string} contentType
 * @return {import('../data/custom-types.js').MediaType}
 */
export function parseContentType(contentType) {
  let type;
  let tree;
  let subtype;
  let suffix;
  /** @type {Record<string,string>} */
  const parameters = {};
  if (contentType) {
    for (const directive of contentType.split(';')) {
      let [key, value] = directive.split('=');
      key = key.trim().toLowerCase();
      if (value === undefined) {
        let rest;
        [type, rest] = key.split('/');
        const treeEntries = rest.split('.');
        const subtypeSuffix = treeEntries.pop();
        tree = treeEntries.join('.');
        [subtype, suffix] = subtypeSuffix.split('+');
        continue;
      }

      value = value.trim();
      const firstQuote = value.indexOf('"');
      const lastQuote = value.lastIndexOf('"');
      if (firstQuote !== -1 && lastQuote !== -1) {
        if (firstQuote === lastQuote) {
          throw new Error('ERR_CONTENT_TYPE');
        }
        value = value.slice(firstQuote + 1, lastQuote);
      }
      parameters[key] = value;
    }
  }
  return {
    type, subtype, suffix, tree, parameters,
  };
}

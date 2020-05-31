export default class HeadersParser {
  constructor(headers = {}) {
    /** @type {Object<string,any>} */
    this.headers = headers;
  }

  /** @return {string} */
  get contentType() {
    return this.headers['content-type'];
  }

  /**
   * The `media-type` directive of `Content-Type`.
   * The MIME type of the resource or the data.
   * (Always lowercase)
   * @return {string}
   */
  get mediaType() {
    return this.contentType?.split(';')[0].trim().toLowerCase();
  }

  /**
   * The `charset` direct of `Content-Type`.
   * The character encoding standard.
   * (Always lowercase)
   * @return {string} */
  get charset() {
    let value = null;
    // eslint-disable-next-line no-unused-expressions
    this.contentType?.split(';').some((directive) => {
      const parameters = directive.split('=');
      if (parameters[0].trim().toLowerCase() !== 'boundary') {
        return false;
      }
      value = parameters[1]?.trim().toLowerCase();
      const firstQuote = value.indexOf('"');
      const lastQuote = value.lastIndexOf('"');
      if (firstQuote !== -1 && lastQuote !== -1) {
        value = value.substring(firstQuote + 1, lastQuote);
      }
      return true;
    });
    return value;
  }

  /** @return {string} */
  get boundary() {
    let value = null;
    // eslint-disable-next-line no-unused-expressions
    this.contentType?.split(';').some((directive) => {
      const parameters = directive.split('=');
      if (parameters[0].trim().toLowerCase() !== 'boundary') {
        return false;
      }
      value = parameters[1]?.trim().toLowerCase();
      const firstQuote = value.indexOf('"');
      const lastQuote = value.lastIndexOf('"');
      if (firstQuote !== -1 && lastQuote !== -1) {
        value = value.substring(firstQuote + 1, lastQuote);
      }
      return true;
    });
    return value;
  }


  /** @return {number} */
  get contentLength() {
    return parseInt(this.headers['content-length'], 10) || null;
  }
}

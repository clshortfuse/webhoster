/** @private */
export default class CookieObject {
  /** @param {CookieDetails|string} options */
  constructor(options) {
    if (typeof options === 'string') {
      return CookieObject.parse(options);
    }
    this.name = options.name;
    this.value = options.value;
    this.expires = options.expires;
    this.maxAge = options.maxAge;
    this.domain = options.domain;
    this.path = options.path;
    this.secure = options.secure;
    this.httpOnly = options.httpOnly;
    this.sameSite = options.sameSite;
  }

  /**
   * @param {string} cookieString
   * @return {CookieObject}
   */
  static parse(cookieString) {
    /** @type {Partial<CookieDetails>} */
    const options = {};
    cookieString.split(';').forEach((attribute, index) => {
      const [key, value] = attribute.split('=').map((s) => s?.trim());
      if (index === 0) {
        options.name = key;
        if (value != null) {
          options.value = value;
        }
        return;
      }
      switch (key.toLowerCase()) {
        case 'expires':
          options.expires = new Date(value);
          return;
        case 'max-age':
          options.maxAge = parseInt(value, 10);
          return;
        case 'domain':
          options.domain = value;
          break;
        case 'path':
          options.path = value;
          break;
        case 'secure':
          options.secure = true;
          break;
        case 'httponly':
          options.httpOnly = true;
          break;
        case 'samesite':
          // @ts-ignore
          options.sameSite = value;
          break;
        default:
      }
    });
    // @ts-ignore
    return new CookieObject(options);
  }

  toString() {
    // eslint-disable-next-line prefer-template
    return `${this.name}=${this.value}`
      + (this.expires != null ? `;Expires=${this.expires.toUTCString()}` : '')
      + (this.maxAge != null ? `;Max-Age=${this.maxAge}` : '')
      + (this.domain ? `;Domain=${this.domain}` : '')
      + (this.path ? `;Path=${this.path}` : '')
      + (this.secure ? ';Secure' : '')
      + (this.httpOnly ? ';HttpOnly' : '')
      + (this.sameSite ? `;SameSite=${this.sameSite}` : '');
  }

  toJSON() {
    return {
      name: this.name,
      value: this.value,
      expires: this.expires,
      maxAge: this.maxAge,
      domain: this.domain,
      path: this.path,
      secure: this.secure || undefined,
      httpOnly: this.httpOnly || undefined,
      sameSite: this.sameSite,
    };
  }
}

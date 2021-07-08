/** @typedef {import('../lib/HttpRequest').default} HttpRequest */
/** @typedef {import('../lib/HttpResponse').default} HttpResponse */

/** @typedef {import('./typings').Middleware} Middleware */

/** @typedef {'GET'|'HEAD'|'POST'|'PUT'|'DELETE'|'CONNECT'|'OPTIONS'|'TRACE'|'PATCH'} RequestMethod */

/** @typedef {'end'|'break'|'continue'|boolean|null|undefined|void} MiddlewareFunctionResultType */
/** @typedef {Promise<Middleware>|Middleware} MiddlewareFunctionResult */
/** @typedef {true|false} MiddlewareContinueBoolean */

/**
 * @typedef {Object} IMiddleware
 * @prop {MiddlewareFunction} execute
 * @prop {MiddlewareErrorHandlerFunction} [onError]
 */

/**
 * @typedef {Object} HandlerState
 * @prop {number[]} treeIndex Middleware level
 */

/**
 * @typedef {Object} MiddlewareFunctionParams
 * @prop {HttpRequest} req
 * @prop {HttpResponse} res
 * @prop {HandlerState} state
 */

/**
 * @typedef {Object} MiddlewareErrorHandlerParams
 * @prop {HttpRequest} req
 * @prop {HttpResponse} res
 * @prop {HandlerState} state
 * @prop {any} [err]
 */

/**
 * @callback MiddlewareFunction
 * @param {!MiddlewareFunctionParams} params
 * @return {MiddlewareFunctionResult}
 */

/**
 * @callback MiddlewareErrorHandlerFunction
 * @param {MiddlewareErrorHandlerParams} params
 * @return {MiddlewareFunctionResult}
 */

/**
 * @typedef {Object} MiddlewareErrorHandler
 * @prop {MiddlewareErrorHandlerFunction} onError
 */

/**
 * @typedef {Object} CookieDetails
 * @prop {string} [name='']
 * A cookie name can be any US-ASCII characters, except control characters, spaces, or tabs.
 * It also must not contain a separator character like the following:( ) < > &#64; , ; : \ " / [ ] ? = { }.
 *   * __Secure- prefix: Cookies names starting with __Secure- (dash is part of the prefix) must be set with the secure flag from a secure page (HTTPS).
 *   * __Host- prefix: Cookies with names starting with __Host- must be set with the secure flag, must be from a secure page (HTTPS), must not have a domain specified (and therefore aren't sent to subdomains) and the path must be /.
 * @prop {string} [value='']
 * A cookie value can optionally be wrapped in double quotes and include any US-ASCII characters excluding
 * control characters, Whitespace, double quotes, comma, semicolon, and backslash.
 *
 * Encoding: Many implementations perform URL encoding on cookie values,
 * however it is not required per the RFC specification.
 * It does help satisfying the requirements about which characters are allowed for cookie value though.
 * @prop {Date} [expires]
 * The maximum lifetime of the cookie as an HTTP-date timestamp.
 *
 * If unspecified, the cookie becomes a session cookie.
 * A session finishes when the client shuts down, and session cookies will be removed.
 * @prop {number} [maxAge]
 * Number of seconds until the cookie expires. A zero or negative number will expire the cookie immediately.
 * If both Expires and Max-Age are set, Max-Age has precedence.
 * @prop {string} [domain]
 * Host to which the cookie will be sent.
 *   * If omitted, defaults to the host of the current document URL, not including subdomains.
 *   * Contrary to earlier specifications, leading dots in domain names (.example.com) are ignored.
 *   * Multiple host/domain values are not allowed, but if a domain is specified, then subdomains are always included.
 * @prop {string} [path]
 * A path that must exist in the requested URL, or the browser won't send the Cookie header.
 *
 * The forward slash (/) character is interpreted as a directory separator, and subdirectories will be matched as well:
 * for Path=/docs, /docs, /docs/Web/, and /docs/Web/HTTP will all match.
 * @prop {boolean} [secure]
 * A secure cookie is only sent to the server when a request is made with the https: scheme.
 * (However, confidential information should never be stored in HTTP Cookies,
 * as the entire mechanism is inherently insecure and doesn't encrypt any information.)
 * @prop {boolean} [httpOnly]
 * Forbids JavaScript from accessing the cookie.
 *
 * For example, through the Document.cookie property, the XMLHttpRequest API, or the Request API.
 * This mitigates attacks against cross-site scripting (XSS).
 * @prop {'Strict'|'Lax'|'None'} [sameSite]
 * Asserts that a cookie must not be sent with cross-origin requests,
 * providing some protection against cross-site request forgery attacks (CSRF).
 *   * Strict: The browser sends the cookie only for same-site requests
 *     (that is, requests originating from the same site that set the cookie).
 *     If the request originated from a different URL than the current one,
 *     no cookies with the SameSite=Strict attribute are sent.
 *   * Lax: The cookie is withheld on cross-site subrequests, such as calls to load images or frames,
 *     but is sent when a user navigates to the URL from an external site, such as by following a link.
 *   * None: The browser sends the cookie with both cross-site and same-site requests.
 */

export default {};

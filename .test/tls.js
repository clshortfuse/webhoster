import { createSecureContext } from 'node:tls';

import x509 from '@fidm/x509';

/**
 @typedef {import('tls').SecureContext} SecureContext
/** @typedef {import('tls').TlsOptions} TlsOptions
 */

/**
 * @callback SNICallback
 * @param {Error} err
 * @param {SecureContext} ctx
 * @return {void}
 */

/** @type {Map<string, SecureContext>} */
const contexts = new Map();

/** @type {Map<string, TlsOptions>} */
export const contextOptions = new Map();

/**
 * @param {TlsOptions} defaultTlsOptions
 * @return {TlsOptions}
 */
export function setup(defaultTlsOptions) {
  contextOptions.set('default', defaultTlsOptions);
  return defaultTlsOptions;
}

/**
 * @param {string} commonName
 * @param {string} serverName
 * @return {boolean}
 */
function checkCommonName(commonName, serverName) {
  if (!commonName || !serverName) return false;
  return new RegExp(`^${commonName.replace('.', '\\.').replace('*', '.*')}$`, 'i').test(serverName);
}

/**
 * @param {string} servername
 * @param {SNICallback} cb
 * @param callback
 * @return {void}
 */
export function SNICallback(servername, callback) {
  const hasContext = contexts.has(servername);
  if (hasContext) {
    console.debug('Resuing context created for:', servername);
    callback(null, contexts.get(servername));
    return;
  }
  const options = [...contextOptions.values()].find((context_) => {
    if (!context_.cert) return false;
    const buffer = (typeof context_.cert === 'string') ? Buffer.from(context_.cert) : context_.cert;
    const cert = x509.Certificate.fromPEM(buffer);
    // Check expired
    if (!cert.validTo || new Date() > cert.validTo) return false;
    // Check not ready
    if (!cert.validFrom || new Date() < cert.validFrom) return false;
    if (!cert || !cert.subject) return false;
    if (checkCommonName(cert.subject.commonName, servername)) return true;
    if (!cert.dnsNames) return false;
    return cert.dnsNames.some((/** @type {string} */ name) => checkCommonName(name, servername));
  });
  let context = null;
  if (options) {
    context = createSecureContext(options);
    console.debug('Context created for:', servername);
  } else {
    console.warn('Unknown servername:', servername);
    // Pick any?
  }
  contexts.set(servername, context);
  callback(null, context);
}

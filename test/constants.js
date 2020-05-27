export const HTTP_PORT = parseInt(process.env.HTTP_PORT || process.env.PORT || '8080', 10);
export const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '8443', 10);
export const HTTP_HOST = process.env.HTTP_HOST || process.env.HOST || '0.0.0.0';
export const HTTPS_HOST = process.env.HTTPS_HOST || process.env.HOST || '0.0.0.0';

import CookieObject from '../data/CookieObject.js';

[
  'id=a3fWa; Expires=Wed, 21 Oct 2015 07:28:00 GMT',
  'id=a3fWa; Max-Age=2592000',
  'qwerty=219ffwef9w0f; Domain=somecompany.co.uk',
  'sessionId=e8bb43229de9; Domain=foo.example.com',
  '__Secure-ID=123; Secure; Domain=example.com',
  '__Host-ID=123; Secure; Path=/',
].forEach((cookie) => {
  const handler = new CookieObject(cookie);
  const rebuilt = new CookieObject(handler.toJSON());
  console.log(cookie);
  console.log(rebuilt.toString());
  console.dir(handler);
  console.dir(rebuilt);
});

import * as starter from '../templates/starter.js';

const middleware = [
  () => 'Hello world!',
];

// Start the singleton HTTP server using the starter convenience API.
await starter.start({ middleware });

// Export nothing — this example file is intended as a tiny runnable demo.
export {};

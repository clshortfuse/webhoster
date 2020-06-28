/* eslint-disable node/no-missing-import */
import resolve from '@rollup/plugin-node-resolve';

/** @typedef {import('rollup')} */
export default {
  input: 'index.js',
  output: {
    file: 'index.cjs',
    format: 'cjs',
  },
  plugins: [
    resolve(),
  ],
};

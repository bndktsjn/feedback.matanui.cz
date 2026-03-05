/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ['@feedback/eslint-config/base', 'next/core-web-vitals'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};

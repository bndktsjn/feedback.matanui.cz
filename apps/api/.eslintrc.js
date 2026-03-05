/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ['@feedback/eslint-config/base'],
  parserOptions: {
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
  },
};

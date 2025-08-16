const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-unused-vars": "error",
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/no-require-imports": "error",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "error",
      "no-console": "warn",
      "no-case-declarations": "error",
      "no-loss-of-precision": "error",
    },
  },
  {
    ignores: ["**/node_modules", "dist", "build"],
  },
);

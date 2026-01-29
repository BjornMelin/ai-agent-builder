const js = require("@eslint/js");
const globals = require("globals");
const jsdoc = require("eslint-plugin-jsdoc");
const tsdoc = require("eslint-plugin-tsdoc");
const tseslint = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

module.exports = [
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "out/**",
    ],
  },

  js.configs.recommended,

  // Next.js core rules (core-web-vitals) via flat config export.
  ...nextCoreWebVitals,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      jsdoc,
      tsdoc,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "jsdoc/check-alignment": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/require-description": "warn",

      // Require docs on exported APIs (warn to keep iteration fast).
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
        },
      ],
      "jsdoc/require-param": "error",
      "jsdoc/require-returns": "error",
      "jsdoc/tag-lines": ["error", "any", { startLines: 1 }],

      // TSDoc syntax enforcement
      "tsdoc/syntax": "error",
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
  },
];

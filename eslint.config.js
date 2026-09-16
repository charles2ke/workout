"use strict";

const js = require("@eslint/js");

// Flat config. The page scripts are plain browser <script> files that also
// export a `_test` surface via CommonJS, so browser and Node globals are both
// in scope for them.
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  location: "readonly",
  fetch: "readonly",
  btoa: "readonly",
  atob: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  TextEncoder: "readonly",
  FileReader: "readonly",
  Uint8Array: "readonly",
  AbortController: "readonly",
  caches: "readonly",
  console: "readonly",
  File: "readonly",
  Blob: "readonly",
  Storage: "readonly",
  MouseEvent: "readonly",
  KeyboardEvent: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  getComputedStyle: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly"
};

const nodeGlobals = {
  module: "writable",
  require: "readonly",
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  __dirname: "readonly"
};

module.exports = [
  {
    ignores: ["node_modules/**", "coverage/**", "dist/**", "playwright-report/**", "playwright-results/**", "playwright-screenshots/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...browserGlobals, ...nodeGlobals }
    },
    rules: {
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["sw.js"],
    languageOptions: {
      globals: { ...browserGlobals, self: "readonly", clients: "readonly", Headers: "readonly", Response: "readonly" }
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { sourceType: "module", globals: nodeGlobals }
  },
  {
    files: ["*.test.js"],
    languageOptions: {
      globals: {
        ...browserGlobals,
        ...nodeGlobals,
        jest: "readonly",
        describe: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly",
        global: "writable",
        setTimeout: "readonly",
        KeyboardEvent: "readonly",
        Event: "readonly"
      }
    }
  },
  {
    files: ["tests/e2e/**/*.js", "playwright.config.js"],
    languageOptions: { globals: { ...nodeGlobals, console: "readonly" } }
  }
];

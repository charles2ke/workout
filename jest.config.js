/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
  collectCoverageFrom: ["workout.js", "fitness.js"],
  coverageThreshold: {
    global: {
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100
    }
  },
  coverageReporters: ["text", "lcov"]
};

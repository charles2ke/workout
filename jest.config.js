/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  collectCoverageFrom: ["workout.js"],
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

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
  // Every hand-written module is covered; sw.js and sw-register.js are
  // browser-only glue that cannot run under jsdom.
  collectCoverageFrom: ["common.js", "workout-log.js", "fitness-core.js", "workout.js", "fitness.js", "settings.js"],
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

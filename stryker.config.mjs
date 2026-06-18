/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  mutate: ['src/**/*.ts', '!src/index.ts', '!src/git/gitDiff.ts', '!src/git/diffTypes.ts', '!src/ai/aiTypes.ts', '!src/ai/aiConstants.ts'],
  reporters: ['html', 'clear-text', 'progress', 'json', 'dashboard'],
  coverageAnalysis: 'perTest',
  dashboard: {
    project: 'github.com/mcarvin8/smart-diff',
    version: 'main',
    reportType: 'full',
  },
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },
  vitest: {
    configFile: 'vitest.config.ts',
  },
};

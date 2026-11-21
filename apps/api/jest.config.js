/** Unit tests: pure logic. Integration tests: real PostgreSQL (see test/setup/global-setup.ts). */
const base = { preset: 'ts-jest', testEnvironment: 'node', transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json', isolatedModules: true }] } };
module.exports = {
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/**/*.int-spec.ts'],
      globalSetup: '<rootDir>/test/setup/global-setup.ts',
      setupFiles: ['<rootDir>/test/setup/env.ts'],
      testTimeout: 60000,
    },
  ],
};

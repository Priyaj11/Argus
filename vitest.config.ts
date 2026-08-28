import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/nock.ts'],
    env: {
      GITHUB_WEBHOOK_SECRET: 'test-secret',
      GITHUB_TOKEN: 'test-token',
      ANTHROPIC_API_KEY: 'test-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // Entry points: both execute on import and expose no testable surface.
      // server.ts starts the listener; demo.ts runs a one-off sample review.
      exclude: ['src/server.ts', 'src/demo.ts'],
      thresholds: {
        statements: 97,
        branches: 97,
        functions: 100,
        lines: 97,
      },
    },
  },
});

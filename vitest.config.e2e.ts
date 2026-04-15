import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['e2e/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['e2e/helpers/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

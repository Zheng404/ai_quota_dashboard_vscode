import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/test/mocks/vscode.ts'),
    },
  },
});

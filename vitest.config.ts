import 'dotenv/config';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Separate unit and integration runs via npm scripts.
    // Integration tests need a real PostgreSQL test database.
    setupFiles: ['tests/setup.ts'],
  },
});

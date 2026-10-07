import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: './server/test/setup.ts',
    include: ['server/**/*.test.ts'],
  },
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 180000,
    hookTimeout: 180000,
    setupFiles: ['./tests/setup.ts'],
  },
})

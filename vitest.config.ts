import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
<<<<<<< before updating
    globals: true,
    testTimeout: 180000,
    hookTimeout: 180000,
    setupFiles: ['./tests/setup.ts'],
||||||| last update
  })
=======
    // Spelled out (matching Vitest's own default) so knip's static analysis
    // of this file can resolve test entry files; Vitest's own runtime
    // behavior is unchanged.
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
>>>>>>> after updating
  },})

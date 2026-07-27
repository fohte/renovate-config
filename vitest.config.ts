import { defineConfig } from 'vitest/config'

<<<<<<< before updating
export default defineConfig({
  test: {
    globals: true,
    testTimeout: 180000,
    hookTimeout: 180000,
    setupFiles: ['./tests/setup.ts'],
  },
})
||||||| last update
export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
=======
export default defineConfig({})
>>>>>>> after updating

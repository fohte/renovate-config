import { test } from 'vitest'
import { RenovateTestContext } from './renovate-test-context'

export function createRenovateTest(fixtures: string[]) {
  return test.extend<{ ctx: RenovateTestContext }>({
    ctx: async ({}, use) => {
      const ctx = new RenovateTestContext()
      ctx.setup(fixtures)
      await use(ctx)
      ctx.cleanup()
    },
  })
}

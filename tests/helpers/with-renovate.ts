import { afterAll, beforeAll, describe } from 'vitest'
import { RenovateTestContext, type SetupOptions } from './renovate-test-context'

export { RenovateTestContext, type SetupOptions }

/**
 * Wraps describe() with automatic renovate context setup/cleanup.
 * Context is shared across all tests in the describe block.
 */
export function describeWithRenovate(
  name: string,
  fixturesOrOptions: string[] | SetupOptions,
  fn: (ctx: RenovateTestContext) => void,
) {
  describe(name, () => {
    const ctx = new RenovateTestContext()
    beforeAll(() => ctx.setup(fixturesOrOptions))
    afterAll(() => ctx.cleanup())
    fn(ctx)
  })
}

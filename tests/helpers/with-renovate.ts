import { afterAll, beforeAll, describe } from 'vitest'
import { RenovateTestContext } from './renovate-test-context'

export { RenovateTestContext }

/**
 * Wraps describe() with automatic renovate context setup/cleanup.
 * Context is shared across all tests in the describe block.
 */
export function describeWithRenovate(
  name: string,
  fixtures: string[],
  fn: (ctx: RenovateTestContext) => void
) {
  describe(name, () => {
    const ctx = new RenovateTestContext()
    beforeAll(() => ctx.setup(fixtures))
    afterAll(() => ctx.cleanup())
    fn(ctx)
  })
}

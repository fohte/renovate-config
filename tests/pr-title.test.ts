import { expect, it } from 'vitest'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'PR title format',
  {
    fixtures: ['.mise.toml'],
    mockCrates: [{ name: 'example-crate', versions: ['1.0.0', '1.1.0'] }],
    dryRunMode: 'full',
  },
  (ctx) => {
    it('should use deps: prefix for minor update', () => {
      const branches = ctx.getBranches()

      // Find the branch for example-crate update
      const branch = branches.find((b) =>
        b.upgrades?.some((u) => u.depName === 'cargo:example-crate')
      )

      expect(branch).toMatchObject({
        prTitle: expect.stringMatching(/^deps: /),
        upgrades: expect.arrayContaining([
          expect.objectContaining({
            depName: 'cargo:example-crate',
            updateType: 'minor',
          }),
        ]),
      })
    })
  }
)

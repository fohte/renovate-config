import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify @fohte/* npm packages are grouped into their own PR instead of being
// swept into the "devDependencies (non-major)" group. First-party packages
// can carry behavioral changes that need isolated review, so they must not
// be bundled with unrelated third-party patches.

describeWithRenovate(
  '@fohte/* package grouping',
  {
    fixtures: ['fohte-packages-grouping/package.json'],
    mockNpmPackages: [
      { name: 'lodash', versions: ['1.0.0', '1.0.1'] },
      { name: '@fohte/storybook-addon', versions: ['1.0.0', '1.0.1'] },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('keeps @fohte/storybook-addon out of the devDependencies (non-major) branch', () => {
      const devDepsBranch = ctx
        .getBranches()
        .find((b) => b.upgrades?.some((u) => u.depName === 'lodash') === true)

      expect(devDepsBranch).toMatchObject({
        prTitle: expect.stringContaining(
          'devDependencies (non-major)',
        ) as unknown,
        upgrades: expect.arrayContaining([
          expect.objectContaining({ depName: 'lodash' }),
        ]) as unknown,
      })
      expect(
        devDepsBranch?.upgrades?.some(
          (u) => u.depName === '@fohte/storybook-addon',
        ),
      ).toBe(false)
    })

    it('groups @fohte/storybook-addon into its own branch', () => {
      const fohteBranch = ctx
        .getBranches()
        .find(
          (b) =>
            b.upgrades?.some((u) => u.depName === '@fohte/storybook-addon') ===
            true,
        )

      expect(fohteBranch).toMatchObject({
        prTitle: expect.stringContaining('@fohte/* packages') as unknown,
        upgrades: expect.arrayContaining([
          expect.objectContaining({ depName: '@fohte/storybook-addon' }),
        ]) as unknown,
      })
      expect(fohteBranch?.upgrades?.some((u) => u.depName === 'lodash')).toBe(
        false,
      )
    })
  },
)

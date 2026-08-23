import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify @fohte/* npm packages are grouped into their own PR instead of being
// swept into the "devDependencies (non-major)" group. First-party packages
// can carry behavioral changes that need an isolated diff, so they must not
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
    it('groups lodash into the devDependencies (non-major) branch, without @fohte/storybook-addon', () => {
      const branch = ctx
        .getBranches()
        .find((b) => b.upgrades?.some((u) => u.depName === 'lodash') === true)

      expect(branch?.upgrades?.map((u) => u.depName)).toEqual(['lodash'])
    })

    it('groups @fohte/storybook-addon into its own branch, without lodash', () => {
      const branch = ctx
        .getBranches()
        .find(
          (b) =>
            b.upgrades?.some((u) => u.depName === '@fohte/storybook-addon') ===
            true,
        )

      expect(branch?.upgrades?.map((u) => u.depName)).toEqual([
        '@fohte/storybook-addon',
      ])
    })
  },
)

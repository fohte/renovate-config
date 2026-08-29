import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify @fohte/* npm packages are excluded from the "devDependencies
// (non-major)" group and from each other, so each first-party package gets
// its own PR. First-party packages can carry behavioral changes that need
// an isolated diff, so they must not be bundled with unrelated third-party
// patches or with other @fohte/* packages.

describeWithRenovate(
  '@fohte/* package ungrouping',
  {
    fixtures: ['fohte-packages-grouping/package.json'],
    mockNpmPackages: [
      { name: 'lodash', versions: ['1.0.0', '1.0.1'] },
      { name: '@fohte/storybook-addon', versions: ['1.0.0', '1.0.1'] },
      { name: '@fohte/service-kit', versions: ['1.0.0', '1.0.1'] },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('groups lodash into the devDependencies (non-major) branch, without any @fohte/* package', () => {
      const branch = ctx
        .getBranches()
        .find((b) => b.upgrades?.some((u) => u.depName === 'lodash') === true)

      expect(branch?.upgrades?.map((u) => u.depName)).toEqual(['lodash'])
    })

    it('puts @fohte/storybook-addon into its own branch, without lodash or @fohte/service-kit', () => {
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

    it('puts @fohte/service-kit into its own branch, without lodash or @fohte/storybook-addon', () => {
      const branch = ctx
        .getBranches()
        .find(
          (b) =>
            b.upgrades?.some((u) => u.depName === '@fohte/service-kit') ===
            true,
        )

      expect(branch?.upgrades?.map((u) => u.depName)).toEqual([
        '@fohte/service-kit',
      ])
    })
  },
)

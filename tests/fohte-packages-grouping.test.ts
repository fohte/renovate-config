import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify @fohte/* npm packages are excluded from grouping, including the
// "devDependencies (non-major)" group and each other, so each first-party
// package gets its own PR.

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

    it.each(['@fohte/storybook-addon', '@fohte/service-kit'])(
      'puts %s into its own branch, without lodash or the other @fohte/* package',
      (depName) => {
        const branch = ctx
          .getBranches()
          .find((b) => b.upgrades?.some((u) => u.depName === depName) === true)

        expect(branch?.upgrades?.map((u) => u.depName)).toEqual([depName])
      },
    )
  },
)

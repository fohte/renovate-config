import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'generic-boilerplate-managed packages in node.json5',
  {
    fixtures: ['generic-boilerplate-managed/package.json'],
    mockNpmPackages: [
      { name: 'prettier', versions: ['3.0.0', '3.1.0'] },
      { name: 'lodash', versions: ['4.17.0', '4.18.0'] },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should disable updates for managed packages (prettier)', () => {
      const pkgFile = ctx.getPackageFile(
        'npm',
        'generic-boilerplate-managed/package.json',
      )
      const prettierDep = pkgFile.deps.find((d) => d.depName === 'prettier')

      expect(prettierDep).toBeDefined()
      // managed packages should be disabled (skipReason or no updates)
      expect(
        prettierDep?.skipReason === 'disabled' ||
          (prettierDep?.updates ?? []).length === 0,
      ).toBe(true)
    })

    it('should allow updates for unmanaged packages (lodash)', () => {
      const pkgFile = ctx.getPackageFile(
        'npm',
        'generic-boilerplate-managed/package.json',
      )
      const lodashDep = pkgFile.deps.find((d) => d.depName === 'lodash')

      expect(lodashDep).toBeDefined()
      expect(lodashDep?.updates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            newValue: '4.18.0',
          }),
        ]),
      )
    })
  },
)

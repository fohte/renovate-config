import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'generic-boilerplate-managed npm packages (node.json5)',
  {
    fixtures: ['generic-boilerplate-managed/package.json'],
    mockNpmPackages: [
      { name: 'eslint', versions: ['9.0.0', '9.1.0'] },
      { name: 'lodash', versions: ['4.17.0', '4.18.0'] },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    const pkgFile = () =>
      ctx.getPackageFile('npm', 'generic-boilerplate-managed/package.json')

    it('should disable updates for managed packages (eslint)', () => {
      const eslintDep = pkgFile().deps.find((d) => d.depName === 'eslint')

      expect(eslintDep).toMatchObject({
        depName: 'eslint',
        skipReason: 'disabled',
      })
    })

    it('should allow updates for unmanaged packages (lodash)', () => {
      const lodashDep = pkgFile().deps.find((d) => d.depName === 'lodash')

      expect(lodashDep).toMatchObject({
        depName: 'lodash',
        updates: expect.arrayContaining([
          expect.objectContaining({
            newValue: '4.18.0',
          }),
        ]) as unknown,
      })
    })
  },
)

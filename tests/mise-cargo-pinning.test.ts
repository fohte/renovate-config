import { expect, it } from 'vitest'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'mise cargo pinning',
  {
    fixtures: ['.mise.toml'],
  },
  (ctx) => {
    it('should extract cargo dependency with crate datasource', () => {
      const miseFile = ctx.getPackageFile('mise', '.mise.toml')
      const dep = miseFile.deps.find((d) => d.depName === 'cargo:example-crate')

      // Verify that mise's cargo backend packages are correctly extracted
      // with the crate datasource. The packageRule in base.json5 sets
      // rangeStrategy: 'bump' for these packages to avoid invalid '=' prefix.
      expect(dep).toBeDefined()
      expect(dep).toMatchObject({
        depName: 'cargo:example-crate',
        currentValue: '1.0.0',
        datasource: 'crate',
        packageName: 'example-crate',
      })
    })
  }
)

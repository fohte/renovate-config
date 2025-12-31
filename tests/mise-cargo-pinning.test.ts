import { expect, it } from 'vitest'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'mise cargo pinning',
  {
    fixtures: ['.mise.toml'],
    mockCrates: [
      { name: 'example-crate', versions: ['1.0.0', '1.1.0', '2.0.0'] },
    ],
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

    it('should use bump rangeStrategy to avoid invalid = prefix', () => {
      const miseFile = ctx.getPackageFile('mise', '.mise.toml')
      const dep = miseFile.deps.find((d) => d.depName === 'cargo:example-crate')

      // Verify that updates use 'bump' rangeStrategy (newValue without '=' prefix).
      // The global 'pin' strategy would produce "=1.1.0", but mise doesn't support that.
      // With 'bump', the newValue should be "1.1.0" (no prefix).
      expect(dep?.updates).toBeDefined()
      expect(dep?.updates?.length).toBeGreaterThan(0)

      const minorUpdate = dep?.updates?.find((u) => u.updateType === 'minor')
      expect(minorUpdate).toBeDefined()
      expect(minorUpdate?.newValue).toBe('1.1.0') // Not "=1.1.0"
    })
  }
)

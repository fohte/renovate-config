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
    // Verify that updates use 'bump' rangeStrategy (newValue without '=' prefix).
    // The global 'pin' strategy would produce "=1.1.0", but mise doesn't support that.
    // With 'bump', the newValue should be "1.1.0" (no prefix).
    it('should use bump rangeStrategy to avoid invalid = prefix', () => {
      const miseFile = ctx.getPackageFile('mise', '.mise.toml')
      const dep = miseFile.deps.find((d) => d.depName === 'cargo:example-crate')

      expect(dep).toMatchObject({
        depName: 'cargo:example-crate',
        currentValue: '1.0.0',
        datasource: 'crate',
        packageName: 'example-crate',
        updates: expect.arrayContaining([
          expect.objectContaining({ updateType: 'minor', newValue: '1.1.0' }),
        ]),
      })
    })
  }
)

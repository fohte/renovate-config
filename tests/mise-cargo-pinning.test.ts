import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'mise cargo pinning',
  {
    fixtures: ['.mise.toml'],
    mockCrates: [{ name: 'example-crate', versions: ['1.0.0'] }],
  },
  (ctx) => {
    // Without the fix (rangeStrategy: 'bump'), the global 'pin' strategy would
    // generate an update with newValue: '=1.0.0'. mise doesn't support the '=' prefix.
    // With 'bump', no pin update is generated for already-exact versions.
    it('should not generate pin update with = prefix', () => {
      const miseFile = ctx.getPackageFile('mise', '.mise.toml')
      const dep = miseFile.deps.find((d) => d.depName === 'cargo:example-crate')

      expect(dep).toMatchObject({
        depName: 'cargo:example-crate',
        currentValue: '1.0.0',
        datasource: 'crate',
        packageName: 'example-crate',
      })

      // Verify no pin update with '=' prefix is generated
      const pinUpdate = dep?.updates?.find((u) => u.updateType === 'pin')
      expect(pinUpdate).toBeUndefined()
    })
  },
)

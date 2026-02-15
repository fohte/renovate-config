import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'mise node pinning',
  {
    fixtures: ['mise-node/.mise.toml'],
    additionalConfigs: ['node.json5', 'renovate.json5'],
  },
  (ctx) => {
    // With 'bump' rangeStrategy for mise + node-version datasource,
    // Renovate should not generate a pin update for major-only versions.
    it('should not generate pin update for major-only version', () => {
      const miseFile = ctx.getPackageFile('mise', 'mise-node/.mise.toml')
      const dep = miseFile.deps.find((d) => d.depName === 'node')

      expect(dep).toBeDefined()
      expect(dep).toMatchObject({
        depName: 'node',
        currentValue: '24',
        datasource: 'node-version',
      })

      const pinUpdate = dep?.updates?.find((u) => u.updateType === 'pin')
      expect(pinUpdate).toBeUndefined()
    })
  },
)

import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'mise node pinning',
  {
    fixtures: ['mise-node/.mise.toml'],
  },
  (ctx) => {
    // With `enabled: false` for mise + node-version datasource,
    // Renovate should not process node at all, so no pin PR is generated.
    it('should not generate updates for node', () => {
      const repoReport = ctx.report?.repositories['local']
      const miseFiles = repoReport?.packageFiles['mise'] as
        | Array<{ packageFile: string; deps: Array<{ depName: string }> }>
        | undefined

      const miseNodeFile = miseFiles?.find(
        (f) => f.packageFile === 'mise-node/.mise.toml',
      )

      if (miseNodeFile) {
        const nodeDep = miseNodeFile.deps.find((d) => d.depName === 'node')
        // If the dep exists, it should be disabled (skipReason or no updates)
        if (nodeDep) {
          const updates = (nodeDep as Record<string, unknown>).updates as
            | Array<{ updateType: string }>
            | undefined
          expect(updates ?? []).toHaveLength(0)
        }
      }
    })
  },
)

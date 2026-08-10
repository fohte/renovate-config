import { expect, it } from 'vitest'

import type { RenovateTestContext } from './helpers/renovate-test-context'
import { describeWithRenovate } from './helpers/with-renovate'

// Looks up the branch for a specific (depName, updateType) pair and reports
// whether it was found at all, alongside its automerge status. Asserting on
// `found` too (instead of only `automerge`) keeps the check from passing
// vacuously when the branch/upgrade never got created (e.g. a broken mock).
function branchAutomergeStatus(
  ctx: RenovateTestContext,
  depName: string,
  updateType: string,
): { found: boolean; automerge: boolean } {
  const branch = ctx
    .getBranches()
    .find(
      (b) =>
        b.upgrades?.some(
          (u) => u.depName === depName && u.updateType === updateType,
        ) ?? false,
    )
  return { found: branch !== undefined, automerge: branch?.automerge === true }
}

describeWithRenovate(
  'mise automerge for node patch updates',
  {
    // Node 22 is in Maintenance LTS, so it only receives patch releases (no
    // new minors), which makes its current tip a stable target for
    // exercising a 'patch'-only update bucket.
    fixtures: ['mise-node-automerge-patch/.mise.toml'],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should automerge a patch update for node', () => {
      expect(branchAutomergeStatus(ctx, 'node', 'patch')).toEqual({
        found: true,
        automerge: true,
      })
    })
  },
)

describeWithRenovate(
  'mise automerge exclusion for node minor updates',
  {
    // Node 24 is in Active LTS and keeps receiving new minors, so its
    // default (non-major) upgrade bucket resolves to a 'minor' update.
    fixtures: ['mise-node-automerge-minor/.mise.toml'],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should not automerge a minor update for node', () => {
      expect(branchAutomergeStatus(ctx, 'node', 'minor')).toEqual({
        found: true,
        automerge: false,
      })
    })
  },
)

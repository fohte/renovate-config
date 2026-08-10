import { expect, it } from 'vitest'

import { branchAutomergeStatus } from './helpers/branch-automerge-status'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'mise automerge for node patch updates',
  {
    fixtures: ['mise-node-automerge-patch/.mise.toml'],
    mockNodeVersions: [{ version: '1.2.0' }, { version: '1.2.1' }],
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
    fixtures: ['mise-node-automerge-minor/.mise.toml'],
    // Renovate's default separateMajorMinor behavior merges patch+minor
    // into a single non-major bucket that jumps to the highest non-major
    // version. With a higher minor available, that bucket resolves to
    // 'minor' and the patch version is never surfaced as its own bucket --
    // hence this needs a separate fixture/scenario from the patch-only case
    // above rather than just adding a higher minor to the same mock list.
    mockNodeVersions: [
      { version: '1.2.0' },
      { version: '1.2.1' },
      { version: '1.3.0' },
    ],
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

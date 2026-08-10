import { expect, it } from 'vitest'

import type { RenovateTestContext } from './helpers/renovate-test-context'
import { describeWithRenovate } from './helpers/with-renovate'

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
  'automerge minor updates for renovatebot/github-action',
  {
    fixtures: [
      'renovatebot-github-action-minor-automerge/.github/workflows/test.yml',
    ],
    mockGitHubRepos: [
      { name: 'renovatebot/github-action', tags: ['v1.0.0', 'v1.1.0'] },
      { name: 'docker/build-push-action', tags: ['v1.0.0', 'v1.1.0'] },
    ],
  },
  (ctx) => {
    it('should automerge a minor update for renovatebot/github-action', () => {
      expect(
        branchAutomergeStatus(ctx, 'renovatebot/github-action', 'minor'),
      ).toEqual({
        found: true,
        automerge: true,
      })
    })

    // Proves the rule is scoped to renovatebot/github-action specifically,
    // not every third-party action.
    it('should not automerge a minor update for another third-party action', () => {
      expect(
        branchAutomergeStatus(ctx, 'docker/build-push-action', 'minor'),
      ).toEqual({
        found: true,
        automerge: false,
      })
    })
  },
)

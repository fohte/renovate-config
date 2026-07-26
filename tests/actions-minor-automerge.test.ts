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
  'automerge minor updates for GitHub-official actions',
  {
    fixtures: ['github-actions-official-automerge/.github/workflows/test.yml'],
    mockGitHubRepos: [
      { name: 'actions/checkout', tags: ['v1.0.0', 'v1.1.0'] },
      { name: 'docker/build-push-action', tags: ['v1.0.0', 'v1.1.0'] },
    ],
  },
  (ctx) => {
    it('should automerge a minor update for actions/checkout', () => {
      expect(branchAutomergeStatus(ctx, 'actions/checkout', 'minor')).toEqual({
        found: true,
        automerge: true,
      })
    })

    // Third-party actions don't share GitHub-official actions' semver
    // discipline, so the `actions/**` rule must not match them.
    it('should not automerge a minor update for a third-party action', () => {
      expect(
        branchAutomergeStatus(ctx, 'docker/build-push-action', 'minor'),
      ).toEqual({
        found: true,
        automerge: false,
      })
    })
  },
)

import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify that the `helpers:pinGitHubActionDigests` preset causes Renovate to
// propose SHA digest pinning for GitHub Actions referenced by tag. This
// mitigates supply chain attacks by ensuring actions resolve to immutable SHAs.

describeWithRenovate(
  'helpers:pinGitHubActionDigests',
  {
    fixtures: ['github-actions/.github/workflows/test.yml'],
    mockGitHubRepos: [{ name: 'actions/checkout', tags: ['v1.0.0'] }],
    allowedExtends: ['helpers:pinGitHubActionDigests'],
    dryRunMode: 'full',
  },
  (ctx) => {
    it('should propose a pinDigest update for tag-referenced actions', () => {
      const branch = ctx
        .getBranches()
        .find(
          (b) =>
            b.upgrades?.some(
              (u) => u.depName?.includes('actions/checkout') === true,
            ) ?? false,
        )

      expect(branch).toMatchObject({
        upgrades: expect.arrayContaining([
          expect.objectContaining({
            depName: expect.stringContaining('actions/checkout') as unknown,
            updateType: 'pinDigest',
          }),
        ]) as unknown,
      })
    })
  },
)

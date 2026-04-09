import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify that the `helpers:pinGitHubActionDigestsToSemver` preset causes
// Renovate to propose SHA digest pinning for GitHub Actions referenced by tag,
// and that the resulting version comment uses the full SemVer (pinact style:
// `# vX.Y.Z`) instead of a floating major tag (`# v3`). SHA pinning mitigates
// supply chain attacks by ensuring actions resolve to immutable SHAs, while
// the SemVer comment lets readers see the exact version at a glance.

describeWithRenovate(
  'helpers:pinGitHubActionDigestsToSemver',
  {
    fixtures: ['github-actions/.github/workflows/test.yml'],
    // Provide both a floating major tag (`v1`) and a full SemVer tag
    // (`v1.0.0`) so we can confirm that `extractVersion` filters out the
    // floating tag and Renovate selects the SemVer one as the comment.
    mockGitHubRepos: [{ name: 'actions/checkout', tags: ['v1', 'v1.0.0'] }],
    allowedExtends: ['helpers:pinGitHubActionDigestsToSemver'],
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

    it('should pin to the full SemVer tag, not the floating major tag', () => {
      const branch = ctx
        .getBranches()
        .find(
          (b) =>
            b.upgrades?.some(
              (u) => u.depName?.includes('actions/checkout') === true,
            ) ?? false,
        )
      const upgrade = branch?.upgrades?.find(
        (u) => u.depName?.includes('actions/checkout') === true,
      )

      // `newValue` is the version that will be written as a comment next to
      // the pinned SHA. With `extractVersion`, the floating `v1` tag is
      // filtered out and only `v1.0.0` is considered.
      expect(upgrade?.newValue).toBe('v1.0.0')
    })
  },
)

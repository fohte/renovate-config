import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Test that minimumReleaseAge blocks packages released within 7 days
// to mitigate supply chain attacks.

const OLD_RELEASE = new Date(
  Date.now() - 30 * 24 * 60 * 60 * 1000,
).toISOString()
const NEW_RELEASE = new Date().toISOString()

describeWithRenovate(
  'minimumReleaseAge',
  {
    fixtures: ['minimum-release-age/package.json'],
    mockNpmPackages: [
      {
        name: 'old-package',
        versions: ['1.0.0', '2.0.0'],
        releaseTimes: {
          '1.0.0': OLD_RELEASE,
          '2.0.0': OLD_RELEASE, // Released 30 days ago - should be allowed
        },
      },
      {
        name: 'new-package',
        versions: ['1.0.0', '2.0.0'],
        releaseTimes: {
          '1.0.0': OLD_RELEASE,
          '2.0.0': NEW_RELEASE, // Released today - should be blocked
        },
      },
    ],
  },
  (ctx) => {
    // We assert on the update's `pendingChecks` flag rather than the branch's
    // `result`, because the harness runs Renovate in lookup mode (the only
    // mode `--platform=local` actually honors). `result` is set by the branch
    // worker, which lookup mode skips; `pendingChecks` is set in lookup mode
    // by `filterInternalChecks` when minimumReleaseAge holds a release back.
    const pendingSummary = (depName: string) => {
      const update = ctx
        .getPackageFile('npm', 'minimum-release-age/package.json')
        .deps.find((d) => d.depName === depName)?.updates?.[0]
      return {
        newVersion: update?.newVersion,
        pendingChecks: update?.pendingChecks ?? false,
      }
    }

    it('should allow old releases (not pending)', () => {
      expect(pendingSummary('old-package')).toEqual({
        newVersion: '2.0.0',
        pendingChecks: false,
      })
    })

    it('should delay recent releases (marked as pending)', () => {
      expect(pendingSummary('new-package')).toEqual({
        newVersion: '2.0.0',
        pendingChecks: true,
      })
    })
  },
)

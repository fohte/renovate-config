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
    dryRunMode: 'full',
  },
  (ctx) => {
    it('should allow old releases (not pending)', () => {
      const branch = ctx
        .getBranches()
        .find((b) => b.upgrades?.some((u) => u.depName === 'old-package'))

      expect(branch).toMatchObject({
        result: expect.not.stringMatching(/^pending$/),
        upgrades: expect.arrayContaining([
          expect.objectContaining({ depName: 'old-package' }),
        ]),
      })
    })

    it('should delay recent releases (marked as pending)', () => {
      const branch = ctx
        .getBranches()
        .find((b) => b.upgrades?.some((u) => u.depName === 'new-package'))

      expect(branch).toMatchObject({
        result: 'pending',
        upgrades: expect.arrayContaining([
          expect.objectContaining({ depName: 'new-package' }),
        ]),
      })
    })
  },
)

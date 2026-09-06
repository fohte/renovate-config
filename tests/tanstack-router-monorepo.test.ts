import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify the tanstack-router-monorepo packageRule keeps dependencies-side
// (@tanstack/react-router) and devDependencies-side (@tanstack/router-plugin)
// packages in one PR. This guards against the "devDependencies (non-major)"
// rule silently re-splitting the monorepo across dependency types.

describeWithRenovate(
  'tanstack-router monorepo grouping',
  {
    fixtures: ['tanstack-router-monorepo/package.json'],
    mockNpmPackages: [
      {
        name: '@tanstack/react-router',
        versions: ['1.170.18', '1.170.32'],
        sourceUrl: 'https://github.com/TanStack/router',
      },
      {
        name: '@tanstack/router-plugin',
        versions: ['1.168.23', '1.168.35'],
        sourceUrl: 'https://github.com/TanStack/router',
      },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('groups @tanstack/react-router and @tanstack/router-plugin into the same PR', () => {
      const tanstackBranch = ctx
        .getBranches()
        .find(
          (b) => b.branchName?.includes('tanstack-router-monorepo') === true,
        )

      expect(tanstackBranch).toMatchObject({
        prTitle: expect.stringContaining('tanstack-router monorepo') as unknown,
        upgrades: expect.arrayContaining([
          expect.objectContaining({ depName: '@tanstack/react-router' }),
          expect.objectContaining({ depName: '@tanstack/router-plugin' }),
        ]) as unknown,
      })
    })
  },
)

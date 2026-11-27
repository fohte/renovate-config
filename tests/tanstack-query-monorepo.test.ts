import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'tanstack-query monorepo grouping',
  {
    fixtures: ['tanstack-query-monorepo/package.json'],
    mockNpmPackages: [
      {
        name: '@tanstack/react-query',
        versions: ['5.0.0', '5.0.1'],
        sourceUrl: 'https://github.com/TanStack/query',
      },
      {
        name: '@tanstack/react-query-devtools',
        versions: ['5.0.0', '5.0.1'],
        sourceUrl: 'https://github.com/TanStack/query',
      },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('groups dependencies and devDependencies into the same PR', () => {
      const branches = ctx
        .getBranches()
        .filter(
          (branch) =>
            branch.upgrades?.some((upgrade) =>
              [
                '@tanstack/react-query',
                '@tanstack/react-query-devtools',
              ].includes(upgrade.depName ?? ''),
            ) ?? false,
        )
        .map((branch) => ({
          branchName: branch.branchName,
          prTitle: branch.prTitle,
          upgrades: branch.upgrades?.map(
            ({ depName, currentVersion, newVersion, updateType }) => ({
              depName,
              currentVersion,
              newVersion,
              updateType,
            }),
          ),
        }))

      expect(branches).toEqual([
        {
          branchName: 'renovate/tanstack-query-monorepo',
          prTitle: 'deps: update tanstack-query monorepo to v5.0.1',
          upgrades: [
            {
              depName: '@tanstack/react-query',
              currentVersion: '5.0.0',
              newVersion: '5.0.1',
              updateType: 'patch',
            },
            {
              depName: '@tanstack/react-query-devtools',
              currentVersion: '5.0.0',
              newVersion: '5.0.1',
              updateType: 'patch',
            },
          ],
        },
      ])
    })
  },
)

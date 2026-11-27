import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'tanstack-query monorepo grouping',
  {
    fixtures: ['tanstack-query-monorepo/package.json'],
    mockNpmPackages: [
      {
        name: '@tanstack/eslint-plugin-query',
        versions: ['1.0.0', '1.1.0'],
        sourceUrl: 'https://github.com/TanStack/query',
      },
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
                '@tanstack/eslint-plugin-query',
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
          prTitle: 'deps: Update tanstack-query monorepo',
          upgrades: [
            {
              depName: '@tanstack/eslint-plugin-query',
              currentVersion: '1.0.0',
              newVersion: '1.1.0',
              updateType: 'minor',
            },
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

describeWithRenovate(
  'tanstack-query dev-only update prefix',
  {
    fixtures: [],
    inlineFiles: {
      'package.json': JSON.stringify({
        name: 'test-tanstack-query-dev-only',
        version: '1.0.0',
        devDependencies: { '@tanstack/eslint-plugin-query': '1.0.0' },
      }),
    },
    mockNpmPackages: [
      {
        name: '@tanstack/eslint-plugin-query',
        versions: ['1.0.0', '1.1.0'],
        sourceUrl: 'https://github.com/TanStack/query',
      },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('keeps dev-only Query updates out of release bumps', () => {
      const branches = ctx
        .getBranches()
        .filter(
          (branch) =>
            branch.upgrades?.some(
              (upgrade) => upgrade.depName === '@tanstack/eslint-plugin-query',
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
          prTitle:
            'chore: Update dependency @tanstack/eslint-plugin-query to v1.1.0',
          upgrades: [
            {
              depName: '@tanstack/eslint-plugin-query',
              currentVersion: '1.0.0',
              newVersion: '1.1.0',
              updateType: 'minor',
            },
          ],
        },
      ])
    })
  },
)

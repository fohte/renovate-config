import { expect, it } from 'vitest'

import {
  describeWithRenovate,
  type RenovateTestContext,
} from './helpers/with-renovate'

function queryBranches(ctx: RenovateTestContext, packageNames: string[]) {
  return ctx
    .getBranches()
    .filter(
      (branch) =>
        branch.upgrades?.some((upgrade) =>
          packageNames.includes(upgrade.depName ?? ''),
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
}

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
      const branches = queryBranches(ctx, [
        '@tanstack/eslint-plugin-query',
        '@tanstack/react-query',
        '@tanstack/react-query-devtools',
      ])

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
  'tanstack-query optional and peer dependency grouping',
  {
    fixtures: [],
    inlineFiles: {
      'package.json': JSON.stringify({
        name: 'test-tanstack-query-runtime-types',
        version: '1.0.0',
        optionalDependencies: { '@tanstack/query-core': '5.0.0' },
        peerDependencies: { '@tanstack/react-query': '5.0.0' },
        devDependencies: { '@tanstack/eslint-plugin-query': '1.0.0' },
      }),
    },
    mockNpmPackages: [
      {
        name: '@tanstack/eslint-plugin-query',
        versions: ['1.0.0', '1.1.0'],
        sourceUrl: 'https://github.com/TanStack/query',
      },
      {
        name: '@tanstack/query-core',
        versions: ['5.0.0', '5.0.1'],
        sourceUrl: 'https://github.com/TanStack/query',
      },
      {
        name: '@tanstack/react-query',
        versions: ['5.0.0', '5.0.1'],
        sourceUrl: 'https://github.com/TanStack/query',
      },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('uses the release prefix when optional or peer dependencies are grouped', () => {
      expect(
        queryBranches(ctx, [
          '@tanstack/eslint-plugin-query',
          '@tanstack/query-core',
          '@tanstack/react-query',
        ]),
      ).toEqual([
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
              depName: '@tanstack/query-core',
              currentVersion: '5.0.0',
              newVersion: '5.0.1',
              updateType: 'patch',
            },
            {
              depName: '@tanstack/react-query',
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
      expect(queryBranches(ctx, ['@tanstack/eslint-plugin-query'])).toEqual([
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

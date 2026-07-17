import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// @langchain/* packages come from the langchainjs monorepo and are not
// registered in Renovate's built-in group:monorepos preset, so without a
// custom groupName they would be updated in separate PRs and could break
// peer dependency constraints between them (e.g. @langchain/openai requires
// a matching @langchain/core range).

describeWithRenovate(
  'langchain monorepo grouping',
  {
    fixtures: ['langchain-monorepo/package.json'],
    mockNpmPackages: [
      {
        name: '@langchain/core',
        versions: ['1.2.1', '1.2.2'],
        sourceUrl: 'https://github.com/langchain-ai/langchainjs',
      },
      {
        name: '@langchain/openai',
        versions: ['1.5.4', '1.5.5'],
        sourceUrl: 'https://github.com/langchain-ai/langchainjs',
      },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('groups @langchain/core and @langchain/openai into the same PR', () => {
      const langchainBranch = ctx
        .getBranches()
        .find((b) => b.branchName?.includes('langchain-monorepo') === true)

      expect(langchainBranch).toMatchObject({
        prTitle: expect.stringContaining('langchain monorepo') as unknown,
        upgrades: expect.arrayContaining([
          expect.objectContaining({ depName: '@langchain/core' }),
          expect.objectContaining({ depName: '@langchain/openai' }),
        ]) as unknown,
      })
    })
  },
)

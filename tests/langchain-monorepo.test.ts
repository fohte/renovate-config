import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify the langchain monorepo packageRule groups scoped (@langchain/*) and
// unscoped (langchain) packages into a single PR. This guards against the
// peer dependency breakage that happens when @langchain/core and a dependent
// package (e.g. @langchain/openai or langchain) update in separate PRs.

describeWithRenovate(
  'langchain monorepo grouping',
  {
    fixtures: ['langchain-monorepo/package.json'],
    mockNpmPackages: [
      {
        name: '@langchain/core',
        versions: ['1.2.1', '1.2.2'],
      },
      {
        name: '@langchain/openai',
        versions: ['1.5.4', '1.5.5'],
      },
      {
        name: 'langchain',
        versions: ['1.5.2', '1.5.3'],
      },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('groups @langchain/core, @langchain/openai, and langchain into the same PR', () => {
      const langchainBranch = ctx
        .getBranches()
        .find((b) => b.branchName?.includes('langchain-monorepo') === true)

      expect(langchainBranch).toMatchObject({
        prTitle: expect.stringContaining('langchain monorepo') as unknown,
        upgrades: expect.arrayContaining([
          expect.objectContaining({ depName: '@langchain/core' }),
          expect.objectContaining({ depName: '@langchain/openai' }),
          expect.objectContaining({ depName: 'langchain' }),
        ]) as unknown,
      })
    })
  },
)

import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

// Verify `group:monorepos` aggregates npm patches of known monorepo packages
// into the ecosystem-named group (`storybook monorepo`) instead of the
// `devDependencies (non-major)` fallback declared in `node.json5`. This
// guards against future packageRule order changes silently re-burying the
// monorepo grouping under the fallback.

describeWithRenovate(
  'group:monorepos overrides node.json5 devDependencies (non-major) fallback',
  {
    fixtures: ['group-monorepos/package.json'],
    mockNpmPackages: [
      {
        name: '@storybook/test',
        versions: ['8.0.0', '8.0.1'],
        sourceUrl: 'https://github.com/storybookjs/storybook',
      },
      {
        name: '@storybook/blocks',
        versions: ['8.0.0', '8.0.1'],
        sourceUrl: 'https://github.com/storybookjs/storybook',
      },
    ],
    additionalConfigs: ['node.json5'],
    allowedExtends: ['group:monorepos'],
  },
  (ctx) => {
    it('groups storybook patches into the storybook monorepo PR', () => {
      const storybookBranch = ctx
        .getBranches()
        .find((b) => b.branchName?.includes('storybook-monorepo') === true)

      expect(storybookBranch).toMatchObject({
        prTitle: expect.stringContaining('storybook monorepo') as unknown,
        upgrades: expect.arrayContaining([
          expect.objectContaining({
            depName: '@storybook/test',
            updateType: 'patch',
          }),
          expect.objectContaining({
            depName: '@storybook/blocks',
            updateType: 'patch',
          }),
        ]) as unknown,
      })
    })
  },
)

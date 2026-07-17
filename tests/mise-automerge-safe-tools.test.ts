import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'mise automerge for formatter/linter/git-hook tools',
  {
    fixtures: ['mise-automerge-safe-tools/.mise.toml'],
    mockNpmPackages: [
      { name: 'prettier', versions: ['3.0.0', '3.1.0', '4.0.0'] },
      { name: '@commitlint/cli', versions: ['21.0.0', '21.0.1'] },
    ],
    mockGitHubRepos: [
      { name: 'mvdan/sh', tags: ['v3.12.0', 'v3.12.1'] },
      { name: 'jqlang/jq', tags: ['v1.8.0', 'v1.8.1'] },
    ],
  },
  (ctx) => {
    it('should automerge a minor update but not a major update for npm:prettier', () => {
      const branches = ctx.getBranches()
      const minorBranch = branches.find(
        (b) =>
          b.upgrades?.some(
            (u) => u.depName === 'npm:prettier' && u.updateType === 'minor',
          ) ?? false,
      )
      const majorBranch = branches.find(
        (b) =>
          b.upgrades?.some(
            (u) => u.depName === 'npm:prettier' && u.updateType === 'major',
          ) ?? false,
      )

      expect(minorBranch?.automerge).toBe(true)
      expect(majorBranch?.automerge).toBeFalsy()
    })

    it('should automerge a patch update for npm:@commitlint/cli', () => {
      const branch = ctx
        .getBranches()
        .find(
          (b) =>
            b.upgrades?.some((u) => u.depName === 'npm:@commitlint/cli') ??
            false,
        )

      expect(branch).toMatchObject({
        automerge: true,
        upgrades: expect.arrayContaining([
          expect.objectContaining({
            depName: 'npm:@commitlint/cli',
            updateType: 'patch',
          }),
        ]) as unknown,
      })
    })

    // shfmt (short registry name) and aqua:mvdan/sh (explicit backend prefix,
    // as written in fohte/dotfiles) both resolve to the same upstream
    // packageName (mvdan/sh), so the automerge rule -- matched by
    // packageName, not the mise.toml key -- must cover both spellings.
    it('should automerge patch updates for both the short name and the aqua-prefixed name of the same tool', () => {
      const branches = ctx.getBranches()
      const shortNameBranch = branches.find(
        (b) => b.upgrades?.some((u) => u.depName === 'shfmt') ?? false,
      )
      const aquaPrefixedBranch = branches.find(
        (b) => b.upgrades?.some((u) => u.depName === 'aqua:mvdan/sh') ?? false,
      )

      expect(shortNameBranch?.automerge).toBe(true)
      expect(aquaPrefixedBranch?.automerge).toBe(true)
    })

    // aqua:jqlang/jq resolves through the same aqua backend / github-tags
    // datasource as aqua:mvdan/sh above, so this proves the rule filters by
    // the specific allowlisted packages rather than matching every aqua tool.
    it('should not automerge aqua:jqlang/jq since it is not in the allowlist', () => {
      const branch = ctx
        .getBranches()
        .find(
          (b) =>
            b.upgrades?.some((u) => u.depName === 'aqua:jqlang/jq') ?? false,
        )

      expect(branch?.automerge).toBeFalsy()
    })
  },
)

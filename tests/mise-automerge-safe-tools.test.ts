import { expect, it } from 'vitest'

import type { RenovateTestContext } from './helpers/renovate-test-context'
import { describeWithRenovate } from './helpers/with-renovate'

// Looks up the branch for a specific (depName, updateType) pair and reports
// whether it was found at all, alongside its automerge status. Asserting on
// `found` too (instead of only `automerge`) keeps the check from passing
// vacuously when the branch/upgrade never got created (e.g. a broken mock).
function branchAutomergeStatus(
  ctx: RenovateTestContext,
  depName: string,
  updateType: string,
): { found: boolean; automerge: boolean } {
  const branch = ctx
    .getBranches()
    .find(
      (b) =>
        b.upgrades?.some(
          (u) => u.depName === depName && u.updateType === updateType,
        ) ?? false,
    )
  return { found: branch !== undefined, automerge: branch?.automerge === true }
}

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
      { name: 'prettier/prettier', tags: ['3.0.0', '3.0.1'] },
    ],
  },
  (ctx) => {
    it('should automerge a minor update for npm:prettier', () => {
      expect(branchAutomergeStatus(ctx, 'npm:prettier', 'minor')).toEqual({
        found: true,
        automerge: true,
      })
    })

    it('should not automerge a major update for npm:prettier', () => {
      expect(branchAutomergeStatus(ctx, 'npm:prettier', 'major')).toEqual({
        found: true,
        automerge: false,
      })
    })

    // The bare `prettier` short name (no `npm:` prefix) resolves to the
    // prettier/prettier GitHub repo via github-releases, a different
    // packageName than `npm:prettier`'s `prettier` -- both must be listed.
    it('should automerge a patch update for the bare `prettier` short name', () => {
      expect(branchAutomergeStatus(ctx, 'prettier', 'patch')).toEqual({
        found: true,
        automerge: true,
      })
    })

    it('should automerge a patch update for npm:@commitlint/cli', () => {
      expect(
        branchAutomergeStatus(ctx, 'npm:@commitlint/cli', 'patch'),
      ).toEqual({
        found: true,
        automerge: true,
      })
    })

    // shfmt (short registry name) and aqua:mvdan/sh (explicit backend prefix,
    // as written in fohte/dotfiles) both resolve to the same upstream
    // packageName (mvdan/sh), so the automerge rule -- matched by
    // packageName, not the mise.toml key -- must cover both spellings.
    it('should automerge a patch update for the short name (shfmt)', () => {
      expect(branchAutomergeStatus(ctx, 'shfmt', 'patch')).toEqual({
        found: true,
        automerge: true,
      })
    })

    it('should automerge a patch update for the aqua-prefixed name (aqua:mvdan/sh)', () => {
      expect(branchAutomergeStatus(ctx, 'aqua:mvdan/sh', 'patch')).toEqual({
        found: true,
        automerge: true,
      })
    })

    // aqua:jqlang/jq resolves through the same aqua backend / github-tags
    // datasource as aqua:mvdan/sh above, so this proves the rule filters by
    // the specific allowlisted packages rather than matching every aqua tool.
    it('should not automerge aqua:jqlang/jq since it is not in the allowlist', () => {
      expect(branchAutomergeStatus(ctx, 'aqua:jqlang/jq', 'patch')).toEqual({
        found: true,
        automerge: false,
      })
    })
  },
)

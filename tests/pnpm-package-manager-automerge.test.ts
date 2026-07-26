import { expect, it } from 'vitest'

import type { RenovateTestContext } from './helpers/renovate-test-context'
import { describeWithRenovate } from './helpers/with-renovate'

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
  'automerge pnpm packageManager minor/patch updates',
  {
    fixtures: ['pr-title-npm-package-manager/package.json'],
    mockNpmPackages: [{ name: 'pnpm', versions: ['1.0.0', '1.1.0'] }],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should automerge a minor update for pnpm', () => {
      expect(branchAutomergeStatus(ctx, 'pnpm', 'minor')).toEqual({
        found: true,
        automerge: true,
      })
    })
  },
)

describeWithRenovate(
  'automerge scope for non-pnpm packageManager values',
  {
    fixtures: ['npm-package-manager-yarn/package.json'],
    mockNpmPackages: [{ name: 'yarn', versions: ['1.0.0', '1.1.0'] }],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    // The rule's safety rationale (pnpm reserves breaking changes for major
    // releases) is pnpm-specific, so it must not extend to other package
    // managers written to the same `packageManager` field.
    it('should not automerge a minor update for yarn', () => {
      expect(branchAutomergeStatus(ctx, 'yarn', 'minor')).toEqual({
        found: true,
        automerge: false,
      })
    })
  },
)

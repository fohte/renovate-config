import type { RenovateTestContext } from './renovate-test-context'

// Looks up the branch for a specific (depName, updateType) pair and reports
// whether it was found at all, alongside its automerge status. Asserting on
// `found` too (instead of only `automerge`) keeps the check from passing
// vacuously when the branch/upgrade never got created (e.g. a broken mock).
export function branchAutomergeStatus(
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

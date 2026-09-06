import type { RenovateTestContext } from './renovate-test-context'

// Reduces the branch grouping depName's upgrades down to the sorted list of
// managers plus automerge, mirroring the branchAutomergeStatus() helper's
// approach of asserting a small derived object instead of Renovate's full
// noisy branch object.
export function branchUpgradeManagers(
  ctx: RenovateTestContext,
  depName: string,
): { found: boolean; automerge: boolean; managers: string[] } {
  const branch = ctx
    .getBranches()
    .find((b) => b.upgrades?.some((u) => u.depName === depName) ?? false)

  const managers = (branch?.upgrades ?? []).map((u) => u.manager ?? '').sort()

  return {
    found: branch !== undefined,
    automerge: branch?.automerge === true,
    managers,
  }
}

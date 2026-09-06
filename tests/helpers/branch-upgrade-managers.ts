import type { RenovateTestContext } from './renovate-test-context'

// Reduces the branch to managers + automerge so the assertion doesn't churn
// on Renovate's full branch object.
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

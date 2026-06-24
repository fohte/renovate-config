// Wrapper that runs renovate's CLI entrypoint after installing a module loader
// hook that patches `addExtractionStats` to also persist the computed
// `branches[]` (with `prTitle`, `branchName`, `upgrades`, etc.) into the
// report.
//
// Why: the `local` platform forces `dryRun` to "lookup", which skips the
// branch worker. `branchifyUpgrades` still produces a full branch list as
// part of the extract stage, but the report's `branches` field is only
// written from inside `finalizeRepo`, which is gated behind
// `dryRun !== "lookup"`. Without this patch the test harness can never observe
// branch-level data like `prTitle` when running under `--platform=local`.

import { register } from 'node:module'

register('./renovate-loader.mjs', import.meta.url)

await import('renovate/dist/renovate.js')

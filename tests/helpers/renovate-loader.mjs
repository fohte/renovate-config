// Node module loader that rewrites renovate's `addExtractionStats` to also
// emit `branches[]` (with `prTitle`, `upgrades`, etc.) into the report.
// See renovate-runner.mjs for the rationale.

function patchSource(result, needle, replacement, errorContext) {
  const source =
    typeof result.source === 'string'
      ? result.source
      : Buffer.from(result.source).toString('utf-8')
  if (!source.includes(needle)) {
    throw new Error(
      `renovate-loader: failed to patch ${errorContext} — upstream source changed`,
    )
  }
  return {
    ...result,
    source: source.replace(needle, replacement),
    format: 'module',
  }
}

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (url.endsWith('/renovate/dist/instrumentation/reporting.js')) {
    const needle =
      'report.repositories[config.repository].packageFiles = extractResult.packageFiles;'
    return patchSource(
      result,
      needle,
      `${needle}\n\treport.repositories[config.repository].branches = extractResult.branches ?? [];`,
      'addExtractionStats',
    )
  }
  // RustVersionDatasource sets `customRegistrySupport = false`, so the
  // standard registryUrls-based mock redirect (see renovate-test-context.ts)
  // is ignored by renovate itself; redirect via env var instead.
  if (url.endsWith('/renovate/dist/modules/datasource/rust-version/index.js')) {
    const needle = 'defaultRegistryUrls = ["https://static.rust-lang.org"];'
    return patchSource(
      result,
      needle,
      'defaultRegistryUrls = [process.env.RENOVATE_TEST_RUST_VERSION_URL ?? "https://static.rust-lang.org"];',
      'RustVersionDatasource.defaultRegistryUrls',
    )
  }
  return result
}

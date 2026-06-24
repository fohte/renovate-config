// Node module loader that rewrites renovate's `addExtractionStats` to also
// emit `branches[]` (with `prTitle`, `upgrades`, etc.) into the report.
// See renovate-runner.mjs for the rationale.

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (url.endsWith('/renovate/dist/instrumentation/reporting.js')) {
    const source =
      typeof result.source === 'string'
        ? result.source
        : Buffer.from(result.source).toString('utf-8')
    const needle =
      'report.repositories[config.repository].packageFiles = extractResult.packageFiles;'
    if (!source.includes(needle)) {
      throw new Error(
        'renovate-loader: failed to patch addExtractionStats — upstream source changed',
      )
    }
    const patched = source.replace(
      needle,
      `${needle}\n\treport.repositories[config.repository].branches = extractResult.branches ?? [];`,
    )
    return { ...result, source: patched, format: 'module' }
  }
  return result
}

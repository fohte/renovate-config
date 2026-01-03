import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import JSON5 from 'json5'
import { describe, expect, it } from 'vitest'

interface PackageRule {
  matchUpdateTypes?: string[]
  matchPackagePatterns?: string[]
  prPriority?: number
}

const baseConfig = JSON5.parse(
  readFileSync(
    fileURLToPath(new URL('../base.json5', import.meta.url)),
    'utf-8',
  ),
) as {
  packageRules?: PackageRule[]
}

describe('PR priority rules', () => {
  it('keeps lockfile maintenance at the front of the queue', () => {
    const rule = baseConfig.packageRules?.find((candidate) => {
      const types = candidate.matchUpdateTypes
      return Array.isArray(types) && types.includes('lockFileMaintenance')
    })

    expect(rule).toMatchObject({
      prPriority: 100,
    })
  })

  it('bumps fohte org updates ahead when rate-limited', () => {
    const rule = baseConfig.packageRules?.find((candidate) => {
      const patterns = candidate.matchPackagePatterns
      return (
        Array.isArray(patterns) &&
        patterns.includes('^fohte/') &&
        patterns.includes('^https://github\\.com/fohte/') &&
        patterns.includes('^git\\+https://github\\.com/fohte/')
      )
    })

    expect(rule).toMatchObject({
      prPriority: 100,
    })
  })
})

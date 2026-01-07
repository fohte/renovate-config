import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import JSON5 from 'json5'
import type { PackageRule, UpdateType } from 'renovate/dist/config/types'
import { describe, expect, it } from 'vitest'

const baseConfig = JSON5.parse(
  readFileSync(
    fileURLToPath(new URL('../base.json5', import.meta.url)),
    'utf-8',
  ),
) as {
  packageRules?: PackageRule[]
}

/**
 * Find the prPriority value for a given package name by evaluating
 * all matching packageRules in order (later rules override earlier ones).
 *
 * matchPackageNames supports both exact matches and regex patterns.
 * Regex patterns use the format `/pattern/` (e.g., `/^fohte\//`).
 */
function getPrPriorityByPackageName(packageName: string): number | undefined {
  let priority: number | undefined

  for (const rule of baseConfig.packageRules ?? []) {
    if (rule.prPriority === undefined) continue

    const names = rule.matchPackageNames ?? []
    const matches = names.some((name) => {
      // Check if it's a regex pattern (wrapped in /.../)
      const regexMatch = name.match(/^\/(.+)\/$/)
      if (regexMatch) {
        return new RegExp(regexMatch[1]).test(packageName)
      }
      // Exact match
      return name === packageName
    })

    if (matches) {
      priority = rule.prPriority
    }
  }

  return priority
}

/**
 * Find the prPriority value for a given updateType by evaluating
 * all matching packageRules in order (later rules override earlier ones).
 */
function getPrPriorityByUpdateType(updateType: UpdateType): number | undefined {
  let priority: number | undefined

  for (const rule of baseConfig.packageRules ?? []) {
    if (rule.prPriority === undefined) continue

    const types = rule.matchUpdateTypes ?? []
    if (types.includes(updateType)) {
      priority = rule.prPriority
    }
  }

  return priority
}

describe('PR priority rules', () => {
  describe('lockFileMaintenance', () => {
    it('should set prPriority to 100', () => {
      expect(getPrPriorityByUpdateType('lockFileMaintenance')).toBe(100)
    })
  })

  describe('fohte org packages', () => {
    const testCases = [
      'fohte/lefthook-config',
      'fohte/renovate-config',
      'https://github.com/fohte/lefthook-config',
      'git+https://github.com/fohte/renovate-config',
    ]

    for (const packageName of testCases) {
      it(`should set prPriority to 100 for "${packageName}"`, () => {
        expect(getPrPriorityByPackageName(packageName)).toBe(100)
      })
    }
  })

  describe('non-fohte packages', () => {
    const testCases = [
      'actions/checkout',
      'lodash',
      'https://github.com/actions/checkout',
    ]

    for (const packageName of testCases) {
      it(`should not set elevated prPriority for "${packageName}"`, () => {
        expect(getPrPriorityByPackageName(packageName)).toBeUndefined()
      })
    }
  })
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import JSON5 from 'json5'
import type { PackageRule } from 'renovate/dist/config/types'
import { describe, expect, it } from 'vitest'

const baseConfig = JSON5.parse(
  readFileSync(
    fileURLToPath(new URL('../base.json5', import.meta.url)),
    'utf-8',
  ),
) as {
  packageRules?: PackageRule[]
}

describe('PR priority rules', () => {
  describe('lockFileMaintenance', () => {
    it('should have a rule with prPriority 100', () => {
      const rule = baseConfig.packageRules?.find(
        (r) =>
          r.matchUpdateTypes?.includes('lockFileMaintenance') &&
          r.prPriority === 100,
      )
      expect(rule).toBeDefined()
    })
  })

  describe('fohte org packages', () => {
    it('should have a rule with matchSourceUrls for fohte and prPriority 100', () => {
      const rule = baseConfig.packageRules?.find(
        (r) =>
          r.matchSourceUrls?.includes('https://github.com/fohte/**') &&
          r.prPriority === 100,
      )
      expect(rule).toBeDefined()
    })
  })
})

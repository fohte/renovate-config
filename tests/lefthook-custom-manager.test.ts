import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import JSON5 from 'json5'
import type { Report } from 'renovate/dist/instrumentation/types'
import type { PackageFile } from 'renovate/dist/modules/manager/types'

const FIXTURES_DIR = join(import.meta.dirname, '__fixtures__')

interface TestContext {
  workDir: string
  report: Report
}

function runRenovateDryRun(workDir: string): Report {
  const reportPath = join(workDir, 'report.json')

  // Read base.json5 and create a test renovate config
  const baseConfig = JSON5.parse(
    readFileSync(join(import.meta.dirname, '..', 'base.json5'), 'utf-8')
  )

  // Create renovate.json with only the customManagers (no presets that require network)
  const testConfig = {
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    customManagers: baseConfig.customManagers,
  }

  writeFileSync(
    join(workDir, 'renovate.json'),
    JSON.stringify(testConfig, null, 2)
  )

  // Run renovate with dry-run and report output
  try {
    const output = execSync(
      [
        'npx',
        'renovate',
        '--platform=local',
        '--require-config=ignored',
        '--dry-run=extract',
        '--report-type=file',
        `--report-path=${reportPath}`,
      ].join(' '),
      {
        cwd: workDir,
        env: {
          ...process.env,
          LOG_LEVEL: 'warn',
          RENOVATE_CONFIG_FILE: join(workDir, 'renovate.json'),
        },
        encoding: 'utf-8',
        timeout: 60000,
      }
    )
  } catch (error: unknown) {
    // renovate may exit with non-zero even on dry-run, but report should still be generated
    const err = error as { stdout?: string; stderr?: string }
    console.warn('Renovate exited with error:', err.stderr?.slice(-2000))
  }

  const reportContent = readFileSync(reportPath, 'utf-8')
  return JSON.parse(reportContent) as Report
}

describe('lefthook customManager', () => {
  const ctx: TestContext = {} as TestContext

  beforeAll(() => {
    // Create a temporary working directory
    ctx.workDir = join(tmpdir(), `renovate-test-${Date.now()}`)
    mkdirSync(ctx.workDir, { recursive: true })

    // Initialize git repo (required for renovate --platform=local)
    execSync('git init', { cwd: ctx.workDir, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', {
      cwd: ctx.workDir,
      stdio: 'pipe',
    })
    execSync('git config user.name "Test"', { cwd: ctx.workDir, stdio: 'pipe' })

    // Copy test fixtures
    cpSync(
      join(FIXTURES_DIR, 'lefthook.yml'),
      join(ctx.workDir, 'lefthook.yml')
    )

    // Create initial commit
    execSync('git add -A && git commit -m "initial"', {
      cwd: ctx.workDir,
      stdio: 'pipe',
    })

    // Run renovate and get report
    ctx.report = runRenovateDryRun(ctx.workDir)
  })

  afterAll(() => {
    // Cleanup
    if (ctx.workDir) {
      rmSync(ctx.workDir, { recursive: true, force: true })
    }
  })

  function getLefthookFile(): PackageFile {
    const repoReport = ctx.report.repositories['local']
    if (!repoReport) {
      throw new Error('Repository report not found')
    }
    const regexFiles = repoReport.packageFiles['regex'] as PackageFile[]
    const lefthookFile = regexFiles?.find(
      (f) => f.packageFile === 'lefthook.yml'
    )
    if (!lefthookFile) {
      throw new Error('lefthook.yml not found in regex package files')
    }
    return lefthookFile
  }

  it('should detect lefthook.yml as a package file', () => {
    const lefthookFile = getLefthookFile()
    expect(lefthookFile.packageFile).toBe('lefthook.yml')
  })

  it('should extract dependency from lefthook.yml', () => {
    const lefthookFile = getLefthookFile()
    expect(lefthookFile.deps.length).toBeGreaterThan(0)

    const dep = lefthookFile.deps[0]!
    expect(dep.depName).toBe('fohte/lefthook-config')
    expect(dep.currentValue).toBe('v0.1.0')
    expect(dep.datasource).toBe('github-tags')
  })

  it('should have correct autoReplaceStringTemplate', () => {
    const lefthookFile = getLefthookFile()
    expect(lefthookFile.autoReplaceStringTemplate).toBe(
      'ref: {{{newValue}}} # renovate: datasource={{{datasource}}} depName={{{depName}}}'
    )
  })
})

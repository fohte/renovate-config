import { execSync, type ExecException } from 'node:child_process'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import JSON5 from 'json5'
import type { Report } from 'renovate/dist/instrumentation/types'
import type { PackageFile } from 'renovate/dist/modules/manager/types'

const FIXTURES_DIR = join(import.meta.dirname, '..', '__fixtures__')
const BASE_CONFIG_PATH = join(import.meta.dirname, '..', '..', 'base.json5')
const RENOVATE_BIN = join(
  import.meta.dirname,
  '..',
  '..',
  'node_modules',
  '.bin',
  'renovate'
)

export class RenovateTestContext {
  workDir: string | null = null
  report: Report | null = null

  /**
   * Set up a temporary git repository with the specified fixture files.
   */
  setup(fixtures: string[]): void {
    // Create a temporary working directory
    this.workDir = mkdtempSync(join(tmpdir(), 'renovate-test-'))

    // Initialize git repo (required for renovate --platform=local)
    execSync('git init', { cwd: this.workDir, stdio: 'pipe' })
    execSync('git config user.email "test@test.com"', {
      cwd: this.workDir,
      stdio: 'pipe',
    })
    execSync('git config user.name "Test"', {
      cwd: this.workDir,
      stdio: 'pipe',
    })

    // Copy test fixtures
    for (const fixture of fixtures) {
      cpSync(join(FIXTURES_DIR, fixture), join(this.workDir, fixture))
    }

    // Create initial commit
    execSync('git add -A && git commit -m "initial"', {
      cwd: this.workDir,
      stdio: 'pipe',
    })

    // Run renovate and get report
    this.report = this.runDryRun()
  }

  /**
   * Clean up the temporary directory.
   */
  cleanup(): void {
    if (this.workDir) {
      rmSync(this.workDir, { recursive: true, force: true })
      this.workDir = null
    }
    this.report = null
  }

  /**
   * Get a package file from the report by manager name and file path.
   */
  getPackageFile(manager: string, filePath: string): PackageFile {
    if (!this.report) {
      throw new Error('Report not available. Did you call setup()?')
    }

    const repoReport = this.report.repositories['local']
    if (!repoReport) {
      throw new Error('Repository report not found')
    }

    const managerFiles = repoReport.packageFiles[manager] as
      | PackageFile[]
      | undefined
    if (!managerFiles) {
      throw new Error(`No package files found for manager: ${manager}`)
    }

    const packageFile = managerFiles.find((f) => f.packageFile === filePath)
    if (!packageFile) {
      throw new Error(
        `${filePath} not found in ${manager} package files. ` +
          `Available: ${managerFiles.map((f) => f.packageFile).join(', ')}`
      )
    }

    return packageFile
  }

  private runDryRun(): Report {
    if (!this.workDir) {
      throw new Error('Work directory not set. Did you call setup()?')
    }

    const reportPath = join(this.workDir, 'report.json')

    // Read base.json5 and create a test renovate config
    const baseConfig = JSON5.parse(readFileSync(BASE_CONFIG_PATH, 'utf-8'))

    // Create renovate.json with only the customManagers (no presets that require network)
    const testConfig = {
      $schema: 'https://docs.renovatebot.com/renovate-schema.json',
      customManagers: baseConfig.customManagers,
    }

    writeFileSync(
      join(this.workDir, 'renovate.json'),
      JSON.stringify(testConfig, null, 2)
    )

    // Run renovate with dry-run and report output
    try {
      execSync(
        [
          RENOVATE_BIN,
          '--platform=local',
          '--require-config=ignored',
          '--dry-run=lookup',
          '--report-type=file',
          `--report-path=${reportPath}`,
        ].join(' '),
        {
          cwd: this.workDir,
          env: {
            ...process.env,
            LOG_LEVEL: 'warn',
            RENOVATE_CONFIG_FILE: join(this.workDir, 'renovate.json'),
            // Renovate expects GITHUB_COM_TOKEN for github.com API access
            GITHUB_COM_TOKEN: process.env['GITHUB_TOKEN'],
          },
          encoding: 'utf-8',
          timeout: 60000,
        }
      )
    } catch (error) {
      // renovate may exit with non-zero even on dry-run, but report should still be generated
      if (process.env['DEBUG']) {
        const execError = error as ExecException
        console.warn(
          'Renovate exited with error:',
          execError.stderr?.slice(-2000) ?? execError.message
        )
      }
    }

    const reportContent = readFileSync(reportPath, 'utf-8')
    return JSON.parse(reportContent) as Report
  }
}

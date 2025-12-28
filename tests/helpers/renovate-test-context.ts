import { execSync, type ExecException } from 'node:child_process'
import {
  mkdirSync,
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

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' })
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' })
}

export interface MockRepo {
  name: string
  tags: string[]
}

export interface SetupOptions {
  fixtures: string[]
  mockRepos?: MockRepo[]
}

export class RenovateTestContext {
  workDir: string | null = null
  report: Report | null = null
  private mockRepoPaths: Map<string, string> = new Map()

  /**
   * Set up a temporary git repository with the specified fixture files.
   */
  setup(fixturesOrOptions: string[] | SetupOptions): void {
    const options: SetupOptions = Array.isArray(fixturesOrOptions)
      ? { fixtures: fixturesOrOptions }
      : fixturesOrOptions

    const { fixtures, mockRepos = [] } = options

    // Create a temporary working directory
    this.workDir = mkdtempSync(join(tmpdir(), 'renovate-test-'))

    // Create mock repos first (so we can replace placeholders in fixtures)
    for (const mockRepo of mockRepos) {
      const repoPath = this.createMockGitRepo(mockRepo.name, mockRepo.tags)
      this.mockRepoPaths.set(mockRepo.name, repoPath)
    }

    // Initialize git repo (required for renovate --platform=local)
    initGitRepo(this.workDir)

    // Copy test fixtures and replace placeholders
    for (const fixture of fixtures) {
      const srcPath = join(FIXTURES_DIR, fixture)
      const destPath = join(this.workDir, fixture)

      // Create parent directories if needed
      mkdirSync(dirname(destPath), { recursive: true })

      let content = readFileSync(srcPath, 'utf-8')
      // Replace {{MOCK_REPO:name}} placeholders with actual paths
      content = content.replace(/\{\{MOCK_REPO:(\w+)\}\}/g, (_, name) => {
        const repoPath = this.mockRepoPaths.get(name)
        if (!repoPath) {
          throw new Error(`Mock repo '${name}' not found`)
        }
        return repoPath
      })
      writeFileSync(destPath, content)
    }

    // Create initial commit
    execSync('git add -A && git commit -m "initial"', {
      cwd: this.workDir,
      stdio: 'pipe',
    })

    // Run renovate and get report
    this.report = this.dryRun()
  }

  /**
   * Create a mock git repository with the specified tags.
   */
  private createMockGitRepo(name: string, tags: string[]): string {
    const repoPath = mkdtempSync(join(tmpdir(), `renovate-mock-${name}-`))
    initGitRepo(repoPath)

    // Create initial commit
    writeFileSync(join(repoPath, 'README.md'), `# ${name}\n`)
    execSync('git add -A && git commit -m "initial"', {
      cwd: repoPath,
      stdio: 'pipe',
    })

    // Create tags
    for (const tag of tags) {
      execSync(`git tag ${tag}`, { cwd: repoPath, stdio: 'pipe' })
    }

    return repoPath
  }

  /**
   * Clean up the temporary directory and mock repos.
   */
  cleanup(): void {
    if (this.workDir) {
      rmSync(this.workDir, { recursive: true, force: true })
      this.workDir = null
    }
    for (const repoPath of this.mockRepoPaths.values()) {
      rmSync(repoPath, { recursive: true, force: true })
    }
    this.mockRepoPaths.clear()
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

  private dryRun(): Report {
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
          },
          encoding: 'utf-8',
          timeout: 60000,
        }
      )
    } catch (error) {
      // renovate may exit with non-zero even on dry-run, but report should still be generated
      const execError = error as ExecException
      console.warn(
        'Renovate exited with error:',
        execError.stderr?.slice(-2000) ?? execError.message
      )
    }

    const reportContent = readFileSync(reportPath, 'utf-8')
    return JSON.parse(reportContent) as Report
  }
}

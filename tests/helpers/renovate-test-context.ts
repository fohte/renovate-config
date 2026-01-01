import { spawn, execSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
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

export interface MockCrate {
  name: string
  versions: string[]
}

export interface SetupOptions {
  fixtures: string[]
  mockRepos?: MockRepo[]
  mockCrates?: MockCrate[]
  // Additional config files to merge with base.json5 (e.g., ['lefthook.json5'])
  additionalConfigs?: string[]
}

export class RenovateTestContext {
  workDir: string | null = null
  report: Report | null = null
  private mockRepoPaths: Map<string, string> = new Map()
  private mockCratesServer: Server | null = null
  private mockCratesPort: number | null = null
  private mockCratesData: Map<string, MockCrate> = new Map()
  private additionalConfigs: string[] = []

  /**
   * Set up a temporary git repository with the specified fixture files.
   */
  async setup(fixturesOrOptions: string[] | SetupOptions): Promise<void> {
    const options: SetupOptions = Array.isArray(fixturesOrOptions)
      ? { fixtures: fixturesOrOptions }
      : fixturesOrOptions

    const {
      fixtures,
      mockRepos = [],
      mockCrates = [],
      additionalConfigs = [],
    } = options
    this.additionalConfigs = additionalConfigs

    // Set up mock crates server if needed
    if (mockCrates.length > 0) {
      await this.startMockCratesServer(mockCrates)
    }

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
    this.report = await this.dryRun()
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
   * Start a mock crates.io API server.
   */
  private startMockCratesServer(crates: MockCrate[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // Store crate data for lookup
      for (const crate of crates) {
        this.mockCratesData.set(crate.name, crate)
      }

      this.mockCratesServer = createServer((req, res) => {
        // Parse crate name from sparse registry URL format
        // For crates with length > 3: /ex/am/example-crate
        // For crates with length 3: /3/e/foo
        // For crates with length 2: /2/ab
        // For crates with length 1: /1/a
        const url = req.url ?? ''
        const parts = url.split('/').filter((p) => p.length > 0)

        // The crate name is always the last part
        const crateName = parts[parts.length - 1] ?? null

        if (!crateName) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }

        const crateData = this.mockCratesData.get(crateName)
        if (!crateData) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }

        // Build sparse registry index response (NDJSON format)
        // Each line is a JSON object with version info
        const lines = crateData.versions.map((version) =>
          JSON.stringify({
            name: crateData.name,
            vers: version,
            deps: [],
            cksum: '0'.repeat(64), // dummy checksum
            features: {},
            yanked: false,
          })
        )

        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(lines.join('\n'))
      })

      this.mockCratesServer.listen(0, '127.0.0.1', () => {
        const address = this.mockCratesServer!.address()
        if (typeof address === 'object' && address) {
          this.mockCratesPort = address.port
          resolve()
        } else {
          reject(new Error('Failed to get server address'))
        }
      })

      this.mockCratesServer.on('error', reject)
    })
  }

  /**
   * Clean up the temporary directory and mock repos.
   */
  async cleanup(): Promise<void> {
    if (this.workDir) {
      try {
        rmSync(this.workDir, { recursive: true, force: true })
      } catch (error) {
        console.error(`Failed to clean up workDir at ${this.workDir}:`, error)
      }
      this.workDir = null
    }
    for (const repoPath of this.mockRepoPaths.values()) {
      try {
        rmSync(repoPath, { recursive: true, force: true })
      } catch (error) {
        console.error(`Failed to clean up mock repo at ${repoPath}:`, error)
      }
    }
    this.mockRepoPaths.clear()

    // Stop mock crates server
    if (this.mockCratesServer) {
      await new Promise<void>((resolve) => {
        this.mockCratesServer!.close(() => resolve())
      })
      this.mockCratesServer = null
      this.mockCratesPort = null
      this.mockCratesData.clear()
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

  private async dryRun(): Promise<Report> {
    if (!this.workDir) {
      throw new Error('Work directory not set. Did you call setup()?')
    }

    const reportPath = join(this.workDir, 'report.json')

    // Read base.json5 and create a test renovate config
    const baseConfig = JSON5.parse(readFileSync(BASE_CONFIG_PATH, 'utf-8'))

    // Read and merge additional config files
    const additionalConfigsContent = this.additionalConfigs.map(
      (configFile) => {
        const configPath = join(import.meta.dirname, '..', '..', configFile)
        return JSON5.parse(readFileSync(configPath, 'utf-8'))
      }
    )

    // Exclude presets that require network access
    const { extends: _, $schema: __, ...baseConfigWithoutPresets } = baseConfig

    // Merge customManagers from additional configs
    const customManagers = [
      ...(baseConfig.customManagers ?? []),
      ...additionalConfigsContent.flatMap((c) => c.customManagers ?? []),
    ]

    // Add packageRule to redirect crate datasource to mock sparse registry if configured
    const packageRules = [...(baseConfig.packageRules ?? [])]
    if (this.mockCratesPort) {
      packageRules.unshift({
        matchDatasources: ['crate'],
        registryUrls: [`sparse+http://127.0.0.1:${this.mockCratesPort}/`],
      })
    }

    const testConfig: Record<string, unknown> = {
      $schema: 'https://docs.renovatebot.com/renovate-schema.json',
      ...baseConfigWithoutPresets,
      customManagers: customManagers.length > 0 ? customManagers : undefined,
      packageRules,
      // Allow custom crate registries for mock server
      allowCustomCrateRegistries: this.mockCratesPort ? true : undefined,
      // Override default registry URL for crate datasource
      defaultRegistryUrls: this.mockCratesPort
        ? { crate: [`sparse+http://127.0.0.1:${this.mockCratesPort}/`] }
        : undefined,
    }

    writeFileSync(
      join(this.workDir, 'renovate.json'),
      JSON.stringify(testConfig, null, 2)
    )

    // Run renovate with dry-run and report output
    // Use spawn instead of execSync to allow the event loop to run (for mock servers)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        RENOVATE_BIN,
        [
          '--platform=local',
          '--require-config=ignored',
          '--dry-run=lookup',
          '--report-type=file',
          `--report-path=${reportPath}`,
        ],
        {
          cwd: this.workDir!,
          env: {
            ...process.env,
            LOG_LEVEL: 'warn',
            RENOVATE_CONFIG_FILE: join(this.workDir!, 'renovate.json'),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )

      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })
      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      const timeout = setTimeout(() => {
        child.kill()
        reject(
          new Error(
            `Renovate timed out after 30s\nstdout: ${stdout.slice(-2000)}\nstderr: ${stderr.slice(-2000)}`
          )
        )
      }, 30000)

      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          console.warn(
            'Renovate exited with error:',
            stderr.slice(-2000),
            '\nstdout:',
            stdout.slice(-2000)
          )
        }
        resolve()
      })

      child.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })

    const reportContent = readFileSync(reportPath, 'utf-8')
    return JSON.parse(reportContent) as Report
  }
}

import { execSync, spawn } from 'node:child_process'
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
import type { BranchCache } from 'renovate/dist/util/cache/repository/types'

const FIXTURES_DIR = join(import.meta.dirname, '..', '__fixtures__')
const BASE_CONFIG_PATH = join(import.meta.dirname, '..', '..', 'base.json5')
const RENOVATE_BIN = join(
  import.meta.dirname,
  '..',
  '..',
  'node_modules',
  '.bin',
  'renovate',
)

// Ignore global/system git config to ensure tests are isolated from local settings
// (e.g., GPG signing, aliases, hooks).
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
}

function initGitRepo(dir: string): void {
  const opts = { cwd: dir, stdio: 'pipe' as const, env: GIT_ENV }
  execSync('git init', opts)
  execSync('git config user.email "test@test.com"', opts)
  execSync('git config user.name "Test"', opts)
}

export interface MockRepo {
  name: string
  tags: string[]
}

export interface MockCrate {
  name: string
  versions: string[]
}

export interface MockNpmPackage {
  name: string
  versions: string[]
  // Map of version to release timestamp (ISO 8601 format)
  // If not specified, defaults to a date old enough to pass minimumReleaseAge
  releaseTimes?: Record<string, string>
}

export interface MockGitHubRepo {
  // Format: owner/repo (e.g., 'actions/checkout')
  name: string
  tags: string[]
}

export interface SetupOptions {
  fixtures: string[]
  mockRepos?: MockRepo[]
  mockCrates?: MockCrate[]
  mockNpmPackages?: MockNpmPackage[]
  mockGitHubRepos?: MockGitHubRepo[]
  // Additional config files to merge with base.json5 (e.g., ['lefthook.json5'])
  additionalConfigs?: string[]
  // Dry-run mode: 'lookup' (default) for fast dependency detection,
  // 'full' for complete branch/PR simulation including prTitle
  dryRunMode?: 'lookup' | 'full'
}

export class RenovateTestContext {
  workDir: string | null = null
  report: Report | null = null
  private mockRepoPaths: Map<string, string> = new Map()
  private mockCratesServer: Server | null = null
  private mockCratesPort: number | null = null
  private mockCratesData: Map<string, MockCrate> = new Map()
  private mockNpmServer: Server | null = null
  private mockNpmPort: number | null = null
  private mockNpmData: Map<string, MockNpmPackage> = new Map()
  private mockGitHubServer: Server | null = null
  private mockGitHubPort: number | null = null
  private mockGitHubData: Map<string, MockGitHubRepo> = new Map()
  private additionalConfigs: string[] = []
  private dryRunMode: 'lookup' | 'full' = 'lookup'

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
      mockNpmPackages = [],
      mockGitHubRepos = [],
      additionalConfigs = [],
      dryRunMode = 'lookup',
    } = options
    this.additionalConfigs = additionalConfigs
    this.dryRunMode = dryRunMode

    // Set up mock crates server if needed
    if (mockCrates.length > 0) {
      await this.startMockCratesServer(mockCrates)
    }

    // Set up mock npm server if needed
    if (mockNpmPackages.length > 0) {
      await this.startMockNpmServer(mockNpmPackages)
    }

    // Set up mock GitHub API server if needed
    if (mockGitHubRepos.length > 0) {
      await this.startMockGitHubServer(mockGitHubRepos)
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
      // Replace {{MOCK_REPO:name}} placeholders with file:// URLs
      content = content.replace(/\{\{MOCK_REPO:([\w-]+)\}\}/g, (_, name) => {
        const repoPath = this.mockRepoPaths.get(name)
        if (!repoPath) {
          throw new Error(`Mock repo '${name}' not found`)
        }
        return `file://${repoPath}`
      })
      writeFileSync(destPath, content)
    }

    // Create initial commit
    execSync('git add -A && git commit -m "initial"', {
      cwd: this.workDir,
      stdio: 'pipe',
      env: GIT_ENV,
    })

    // Run renovate and get report
    this.report = await this.dryRun()
  }

  /**
   * Create a mock git repository with the specified tags.
   */
  private createMockGitRepo(name: string, tags: string[]): string {
    // Replace / with - in directory name to avoid path issues
    const safeName = name.replace(/\//g, '-')
    const repoPath = mkdtempSync(join(tmpdir(), `renovate-mock-${safeName}-`))
    initGitRepo(repoPath)

    // Create initial commit
    writeFileSync(join(repoPath, 'README.md'), `# ${name}\n`)
    execSync('git add -A && git commit -m "initial"', {
      cwd: repoPath,
      stdio: 'pipe',
      env: GIT_ENV,
    })

    // Create tags
    for (const tag of tags) {
      execSync(`git tag ${tag}`, { cwd: repoPath, stdio: 'pipe', env: GIT_ENV })
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
          }),
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
   * Start a mock npm registry server.
   */
  private startMockNpmServer(packages: MockNpmPackage[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // Store package data for lookup
      for (const pkg of packages) {
        this.mockNpmData.set(pkg.name, pkg)
      }

      this.mockNpmServer = createServer((req, res) => {
        // Parse package name from URL
        // For regular packages: /package-name
        // For scoped packages: /@scope%2Fpackage-name
        const url = req.url ?? ''
        const packageName = decodeURIComponent(url.slice(1)) // Remove leading /

        const pkgData = this.mockNpmData.get(packageName)
        if (!pkgData) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }

        // Build npm registry response
        const versions: Record<string, object> = {}
        const distTags: Record<string, string> = {}
        const time: Record<string, string> = {}

        // Default to 30 days ago if no release time specified
        const defaultReleaseTime = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString()

        for (const version of pkgData.versions) {
          versions[version] = {
            name: pkgData.name,
            version,
            dependencies: {},
            devDependencies: {},
          }
          time[version] = pkgData.releaseTimes?.[version] ?? defaultReleaseTime
        }

        // Set latest tag to the highest version
        const sortedVersions = [...pkgData.versions].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true }),
        )
        distTags['latest'] = sortedVersions[sortedVersions.length - 1] ?? ''

        const response = {
          name: pkgData.name,
          versions,
          'dist-tags': distTags,
          time,
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(response))
      })

      this.mockNpmServer.listen(0, '127.0.0.1', () => {
        const address = this.mockNpmServer!.address()
        if (typeof address === 'object' && address) {
          this.mockNpmPort = address.port
          resolve()
        } else {
          reject(new Error('Failed to get server address'))
        }
      })

      this.mockNpmServer.on('error', reject)
    })
  }

  /**
   * Start a mock GitHub API server for github-tags datasource.
   */
  private startMockGitHubServer(repos: MockGitHubRepo[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // Store repo data for lookup
      for (const repo of repos) {
        this.mockGitHubData.set(repo.name, repo)
      }

      this.mockGitHubServer = createServer((req, res) => {
        const url = req.url ?? ''

        // Handle GraphQL endpoint
        if (url === '/api/graphql' || url === '/graphql') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const query = JSON.parse(body)

              // Extract repo name from query variables
              const repoName = `${query.variables?.owner}/${query.variables?.name}`
              const repoData = this.mockGitHubData.get(repoName)

              if (!repoData) {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(
                  JSON.stringify({
                    data: { repository: null },
                    errors: [{ message: 'Repository not found' }],
                  }),
                )
                return
              }

              // Build GraphQL response for refs query
              const nodes = repoData.tags.map((tag) => ({
                version: tag,
                target: {
                  type: 'Commit',
                  oid: '0'.repeat(40),
                  releaseTimestamp: new Date().toISOString(),
                },
              }))

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  data: {
                    repository: {
                      isRepoPrivate: false,
                      payload: {
                        pageInfo: {
                          hasNextPage: false,
                          endCursor: null,
                        },
                        nodes,
                      },
                    },
                  },
                }),
              )
            } catch {
              res.writeHead(400)
              res.end('Invalid request')
            }
          })
          return
        }

        // Parse owner/repo from URL for REST API
        // GitHub API format: /repos/:owner/:repo/tags
        // GitHub Enterprise format: /api/v3/repos/:owner/:repo/tags
        const match = url.match(/^(?:\/api\/v3)?\/repos\/([^/]+\/[^/]+)\/tags/)

        if (!match) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }

        const repoName = match[1]!
        const repoData = this.mockGitHubData.get(repoName)
        if (!repoData) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }

        // Build GitHub API tags response
        const tags = repoData.tags.map((tag) => ({
          name: tag,
          commit: {
            sha: '0'.repeat(40),
            url: `http://127.0.0.1:${this.mockGitHubPort}/repos/${repoName}/commits/${'0'.repeat(40)}`,
          },
          zipball_url: `http://127.0.0.1:${this.mockGitHubPort}/repos/${repoName}/zipball/${tag}`,
          tarball_url: `http://127.0.0.1:${this.mockGitHubPort}/repos/${repoName}/tarball/${tag}`,
        }))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(tags))
      })

      this.mockGitHubServer.listen(0, '127.0.0.1', () => {
        const address = this.mockGitHubServer!.address()
        if (typeof address === 'object' && address) {
          this.mockGitHubPort = address.port
          resolve()
        } else {
          reject(new Error('Failed to get server address'))
        }
      })

      this.mockGitHubServer.on('error', reject)
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

    // Stop mock npm server
    if (this.mockNpmServer) {
      await new Promise<void>((resolve) => {
        this.mockNpmServer!.close(() => resolve())
      })
      this.mockNpmServer = null
      this.mockNpmPort = null
      this.mockNpmData.clear()
    }

    // Stop mock GitHub API server
    if (this.mockGitHubServer) {
      await new Promise<void>((resolve) => {
        this.mockGitHubServer!.close(() => resolve())
      })
      this.mockGitHubServer = null
      this.mockGitHubPort = null
      this.mockGitHubData.clear()
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
          `Available: ${managerFiles.map((f) => f.packageFile).join(', ')}`,
      )
    }

    return packageFile
  }

  /**
   * Get branches from the report.
   * Only available when dryRunMode is 'full'.
   */
  getBranches(): Partial<BranchCache>[] {
    if (!this.report) {
      throw new Error('Report not available. Did you call setup()?')
    }

    const repoReport = this.report.repositories['local']
    if (!repoReport) {
      throw new Error('Repository report not found')
    }

    return repoReport.branches
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
      },
    )

    // Exclude presets that require network access
    const { extends: _, $schema: __, ...baseConfigWithoutPresets } = baseConfig

    // Merge customManagers from additional configs
    const customManagers = [
      ...(baseConfig.customManagers ?? []),
      ...additionalConfigsContent.flatMap((c) => c.customManagers ?? []),
    ]

    // Merge packageRules from base config and additional configs
    const packageRules = [
      ...(baseConfig.packageRules ?? []),
      ...additionalConfigsContent.flatMap((c) => c.packageRules ?? []),
    ]

    // Add packageRule to redirect datasources to mock registries if configured
    if (this.mockCratesPort) {
      packageRules.unshift({
        matchDatasources: ['crate'],
        registryUrls: [`sparse+http://127.0.0.1:${this.mockCratesPort}/`],
      })
    }
    if (this.mockNpmPort) {
      packageRules.unshift({
        matchDatasources: ['npm'],
        registryUrls: [`http://127.0.0.1:${this.mockNpmPort}/`],
      })
    }

    // Add packageRule for github-tags datasource
    if (this.mockGitHubPort) {
      packageRules.unshift({
        matchDatasources: ['github-tags'],
        registryUrls: [`http://127.0.0.1:${this.mockGitHubPort}/`],
      })
    }

    // Build hostRules for authentication
    const hostRules: object[] = []
    if (this.mockGitHubPort) {
      // Provide a fake token to satisfy github-token-required check
      hostRules.push({
        matchHost: `127.0.0.1:${this.mockGitHubPort}`,
        token: 'fake-token-for-testing',
      })
    }

    const testConfig: Record<string, unknown> = {
      $schema: 'https://docs.renovatebot.com/renovate-schema.json',
      ...baseConfigWithoutPresets,
      customManagers: customManagers.length > 0 ? customManagers : undefined,
      packageRules,
      hostRules: hostRules.length > 0 ? hostRules : undefined,
      // Enable semantic commits explicitly since extends preset is excluded
      // and auto-detection won't work without real commit history
      semanticCommits: 'enabled',
      // Allow custom crate registries for mock server
      allowCustomCrateRegistries: this.mockCratesPort ? true : undefined,
      // Override default registry URL for crate datasource
      defaultRegistryUrls: this.mockCratesPort
        ? { crate: [`sparse+http://127.0.0.1:${this.mockCratesPort}/`] }
        : undefined,
    }

    writeFileSync(
      join(this.workDir, 'renovate.json'),
      JSON.stringify(testConfig, null, 2),
    )

    // Run renovate with dry-run and report output
    // Use spawn instead of execSync to allow the event loop to run (for mock servers)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        RENOVATE_BIN,
        [
          '--platform=local',
          '--require-config=ignored',
          `--dry-run=${this.dryRunMode}`,
          '--report-type=file',
          `--report-path=${reportPath}`,
        ],
        {
          cwd: this.workDir!,
          env: {
            ...process.env,
            LOG_LEVEL: 'warn',
            RENOVATE_CONFIG_FILE: join(this.workDir!, 'renovate.json'),
            // Provide fake token for github-actions tests
            GITHUB_COM_TOKEN: this.mockGitHubPort
              ? 'fake-token-for-testing'
              : undefined,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
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
            `Renovate timed out after 30s\nstdout: ${stdout.slice(-2000)}\nstderr: ${stderr.slice(-2000)}`,
          ),
        )
      }, 30000)

      child.on('close', (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          console.warn(
            'Renovate exited with error:',
            stderr.slice(-2000),
            '\nstdout:',
            stdout.slice(-2000),
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

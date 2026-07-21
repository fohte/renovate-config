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
// We invoke renovate through a tiny wrapper instead of node_modules/.bin/renovate
// because the wrapper patches the `local` platform's `initPlatform` so that
// `--dry-run=full` is preserved (the stock implementation downgrades any
// non-`extract` value to `lookup`, leaving the report's branches[] empty).
const RENOVATE_RUNNER = join(import.meta.dirname, 'renovate-runner.mjs')

// Ignore global/system git config to ensure tests are isolated from local settings
// (e.g., GPG signing, aliases, hooks).
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
}

// Default release time for mock packages, old enough to satisfy
// `minimumReleaseAge: '7 days'` in base.json5 without per-test overrides.
function defaultMockReleaseTime(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
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
  // Source repository URL injected into each version's `repository.url`.
  // Required for `matchSourceUrls`-based presets (e.g. `monorepo:storybook`).
  sourceUrl?: string
}

export interface MockGitHubRepo {
  // Format: owner/repo (e.g., 'actions/checkout')
  name: string
  tags: string[]
}

export interface SetupOptions {
  fixtures: string[]
  // `{{MOCK_REPO:name}}` placeholders are substituted, matching fixtures behavior.
  inlineFiles?: Record<string, string>
  mockRepos?: MockRepo[]
  mockCrates?: MockCrate[]
  mockNpmPackages?: MockNpmPackage[]
  mockGitHubRepos?: MockGitHubRepo[]
  // Additional config files to merge with base.json5 (e.g., ['lefthook.json5'])
  additionalConfigs?: string[]
  // Presets from base.json5's `extends` to re-include in the test config.
  // Presets are excluded by default because most of them require network
  // access to resolve. Use this to opt in to network-free presets (e.g.
  // `helpers:pinGitHubActionDigests`) whose behavior needs verification.
  allowedExtends?: string[]
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
  private allowedExtends: string[] = []

  /**
   * Set up a temporary git repository with the specified fixture files.
   */
  async setup(fixturesOrOptions: string[] | SetupOptions): Promise<void> {
    const options: SetupOptions = Array.isArray(fixturesOrOptions)
      ? { fixtures: fixturesOrOptions }
      : fixturesOrOptions

    const {
      fixtures,
      inlineFiles = {},
      mockRepos = [],
      mockCrates = [],
      mockNpmPackages = [],
      mockGitHubRepos = [],
      additionalConfigs = [],
      allowedExtends = [],
    } = options
    this.additionalConfigs = additionalConfigs
    this.allowedExtends = allowedExtends

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

    const substituteMockRepos = (content: string): string =>
      content.replace(/\{\{MOCK_REPO:([\w-]+)\}\}/g, (_, name: string) => {
        const repoPath = this.mockRepoPaths.get(name)
        if (repoPath === undefined) {
          throw new Error(`Mock repo '${name}' not found`)
        }
        return `file://${repoPath}`
      })

    // Copy test fixtures and replace placeholders
    for (const fixture of fixtures) {
      const srcPath = join(FIXTURES_DIR, fixture)
      const destPath = join(this.workDir, fixture)
      mkdirSync(dirname(destPath), { recursive: true })
      writeFileSync(
        destPath,
        substituteMockRepos(readFileSync(srcPath, 'utf-8')),
      )
    }

    // Write inline files (heredoc-style payloads) into workDir
    for (const [relPath, content] of Object.entries(inlineFiles)) {
      const destPath = join(this.workDir, relPath)
      mkdirSync(dirname(destPath), { recursive: true })
      writeFileSync(destPath, substituteMockRepos(content))
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

        if (crateName === null || crateName.length === 0) {
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
        const server = this.mockCratesServer
        if (server === null) {
          reject(new Error('Server was closed before it started'))
          return
        }
        const address = server.address()
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
        const defaultReleaseTime = defaultMockReleaseTime()

        for (const version of pkgData.versions) {
          versions[version] = {
            name: pkgData.name,
            version,
            dependencies: {},
            devDependencies: {},
            ...(pkgData.sourceUrl !== undefined
              ? { repository: { type: 'git', url: pkgData.sourceUrl } }
              : {}),
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
        const server = this.mockNpmServer
        if (server === null) {
          reject(new Error('Server was closed before it started'))
          return
        }
        const address = server.address()
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
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString()
          })
          req.on('end', () => {
            try {
              interface GraphQLQuery {
                query?: string
                variables?: { owner?: string; name?: string }
              }
              // Use JSON5.parse with type parameter to avoid unsafe any assignment
              const query = JSON5.parse<GraphQLQuery>(body)

              // Extract repo name from query variables
              const owner = query.variables?.owner ?? ''
              const name = query.variables?.name ?? ''
              const repoName = `${owner}/${name}`
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

              const releaseTimestamp = defaultMockReleaseTime()

              // github-releases datasource (queryReleases) sends a `releases(...)`
              // query, distinct from the `refs(...)` query used by the
              // github-tags datasource (queryTags). Detect which one was sent
              // and shape the response nodes to match, since the two use
              // different field sets.
              const isReleasesQuery =
                query.query?.includes('releases(') ?? false

              const nodes = isReleasesQuery
                ? repoData.tags.map((tag, index) => ({
                    version: tag,
                    releaseTimestamp,
                    isDraft: false,
                    isPrerelease: false,
                    url: `https://github.com/${repoName}/releases/tag/${tag}`,
                    id: index,
                    name: tag,
                    description: null,
                  }))
                : repoData.tags.map((tag) => ({
                    version: tag,
                    target: {
                      type: 'Commit',
                      oid: '0'.repeat(40),
                      releaseTimestamp,
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

        const repoName = match[1]
        if (repoName === undefined) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }
        const repoData = this.mockGitHubData.get(repoName)
        if (!repoData) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }

        // Build GitHub API tags response
        const port = this.mockGitHubPort ?? 0
        const tags = repoData.tags.map((tag) => ({
          name: tag,
          commit: {
            sha: '0'.repeat(40),
            url: `http://127.0.0.1:${String(port)}/repos/${repoName}/commits/${'0'.repeat(40)}`,
          },
          zipball_url: `http://127.0.0.1:${String(port)}/repos/${repoName}/zipball/${tag}`,
          tarball_url: `http://127.0.0.1:${String(port)}/repos/${repoName}/tarball/${tag}`,
        }))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(tags))
      })

      this.mockGitHubServer.listen(0, '127.0.0.1', () => {
        const server = this.mockGitHubServer
        if (server === null) {
          reject(new Error('Server was closed before it started'))
          return
        }
        const address = server.address()
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
    if (this.workDir !== null) {
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
    if (this.mockCratesServer !== null) {
      const server = this.mockCratesServer
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
      this.mockCratesServer = null
      this.mockCratesPort = null
      this.mockCratesData.clear()
    }

    // Stop mock npm server
    if (this.mockNpmServer !== null) {
      const server = this.mockNpmServer
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      })
      this.mockNpmServer = null
      this.mockNpmPort = null
      this.mockNpmData.clear()
    }

    // Stop mock GitHub API server
    if (this.mockGitHubServer !== null) {
      const server = this.mockGitHubServer
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
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

    const managerFiles = repoReport.packageFiles[manager]
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

  // Returns `undefined` when the manager produced no package files or the
  // file was not picked up, instead of throwing. Use this when a test
  // expects "no match" rather than a hit.
  tryGetPackageFile(
    manager: string,
    filePath: string,
  ): PackageFile | undefined {
    if (!this.report) {
      throw new Error('Report not available. Did you call setup()?')
    }
    const repoReport = this.report.repositories['local']
    if (!repoReport) {
      return undefined
    }
    return repoReport.packageFiles[manager]?.find(
      (f) => f.packageFile === filePath,
    )
  }

  /**
   * Get branches from the report. Each entry includes `prTitle`, `branchName`,
   * and `upgrades[]` with the per-update fields needed to assert on PR title
   * and commit prefix behavior.
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
    if (this.workDir === null) {
      throw new Error('Work directory not set. Did you call setup()?')
    }

    // Capture in local variable so TypeScript can narrow the type in closures
    const workDir = this.workDir
    const reportPath = join(workDir, 'report.json')

    // Parsed JSON5 config shape used for type-safe property access
    interface ParsedConfig {
      extends?: unknown[]
      $schema?: string
      customManagers?: unknown[]
      packageRules?: unknown[]
      [key: string]: unknown
    }

    // Read base.json5 and create a test renovate config
    const baseConfig = JSON5.parse<ParsedConfig>(
      readFileSync(BASE_CONFIG_PATH, 'utf-8'),
    )

    // Read and merge additional config files
    const additionalConfigsContent = this.additionalConfigs.map(
      (configFile) => {
        const configPath = join(import.meta.dirname, '..', '..', configFile)
        return JSON5.parse<ParsedConfig>(readFileSync(configPath, 'utf-8'))
      },
    )

    // Exclude presets that require network access. Opt-in presets listed in
    // `allowedExtends` are re-added below so tests can verify their behavior.
    const {
      extends: baseExtends,
      $schema: __,
      ...baseConfigWithoutPresets
    }: ParsedConfig = baseConfig

    // Filter base extends to only the opt-in presets. This guards against
    // typos in `allowedExtends` that do not actually appear in base.json5.
    const baseExtendsArray = Array.isArray(baseExtends) ? baseExtends : []
    const filteredExtends = this.allowedExtends.filter((preset) =>
      baseExtendsArray.includes(preset),
    )

    // Merge customManagers from additional configs
    const customManagers: unknown[] = [
      ...(baseConfig.customManagers ?? []),
      ...additionalConfigsContent.flatMap((c) => c.customManagers ?? []),
    ]

    // Merge packageRules from base config and additional configs
    const packageRules: unknown[] = [
      ...(baseConfig.packageRules ?? []),
      ...additionalConfigsContent.flatMap((c) => c.packageRules ?? []),
    ]

    // Add packageRule to redirect datasources to mock registries if configured
    if (this.mockCratesPort !== null) {
      packageRules.unshift({
        matchDatasources: ['crate'],
        registryUrls: [
          `sparse+http://127.0.0.1:${String(this.mockCratesPort)}/`,
        ],
      })
    }
    if (this.mockNpmPort !== null) {
      packageRules.unshift({
        matchDatasources: ['npm'],
        registryUrls: [`http://127.0.0.1:${String(this.mockNpmPort)}/`],
      })
    }

    // Add packageRule for github-tags/github-releases datasources
    if (this.mockGitHubPort !== null) {
      packageRules.unshift({
        matchDatasources: ['github-tags', 'github-releases'],
        registryUrls: [`http://127.0.0.1:${String(this.mockGitHubPort)}/`],
      })
    }

    // Build hostRules for authentication
    const hostRules: object[] = []
    if (this.mockGitHubPort !== null) {
      // Provide a fake token to satisfy github-token-required check
      hostRules.push({
        matchHost: `127.0.0.1:${String(this.mockGitHubPort)}`,
        token: 'fake-token-for-testing',
      })
    }

    const testConfig: Record<string, unknown> = {
      $schema: 'https://docs.renovatebot.com/renovate-schema.json',
      ...baseConfigWithoutPresets,
      extends: filteredExtends.length > 0 ? filteredExtends : undefined,
      customManagers: customManagers.length > 0 ? customManagers : undefined,
      packageRules,
      hostRules: hostRules.length > 0 ? hostRules : undefined,
      // Enable semantic commits explicitly since extends preset is excluded
      // and auto-detection won't work without real commit history
      semanticCommits: 'enabled',
      // Allow custom crate registries for mock server
      allowCustomCrateRegistries:
        this.mockCratesPort !== null ? true : undefined,
      // Override default registry URL for crate datasource
      defaultRegistryUrls:
        this.mockCratesPort !== null
          ? {
              crate: [
                `sparse+http://127.0.0.1:${String(this.mockCratesPort)}/`,
              ],
            }
          : undefined,
    }

    writeFileSync(
      join(workDir, 'renovate.json'),
      JSON.stringify(testConfig, null, 2),
    )

    // Run renovate with dry-run and report output
    // Use spawn instead of execSync to allow the event loop to run (for mock servers)
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          RENOVATE_RUNNER,
          '--platform=local',
          '--require-config=ignored',
          // `local` always downgrades to `lookup`; we ship a loader-time patch
          // in renovate-runner.mjs that still surfaces branches[] in the report.
          '--dry-run=lookup',
          '--report-type=file',
          `--report-path=${reportPath}`,
        ],
        {
          cwd: workDir,
          env: {
            ...process.env,
            LOG_LEVEL: 'warn',
            RENOVATE_CONFIG_FILE: join(workDir, 'renovate.json'),
            // Provide fake token for github-actions tests
            GITHUB_COM_TOKEN:
              this.mockGitHubPort !== null
                ? 'fake-token-for-testing'
                : undefined,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )

      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString()
      })
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString()
      })

      const timeout = setTimeout(() => {
        child.kill()
        reject(
          new Error(
            `Renovate timed out after 120s\nstdout: ${stdout.slice(-2000)}\nstderr: ${stderr.slice(-2000)}`,
          ),
        )
      }, 120000)

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
    // The report file is produced by renovate and conforms to the Report interface
    return JSON5.parse<Report>(reportContent)
  }
}

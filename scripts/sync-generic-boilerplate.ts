/**
 * Syncs package lists from generic-boilerplate to renovate-config.
 *
 * This script:
 * 1. Clones generic-boilerplate (shallow)
 * 2. Scans all generated/* directories for package.json and Cargo.toml
 * 3. Updates node.json5 and rust.json5 with the extracted package names
 *
 * For npm, only packages in NPM_ALLOWLIST are tracked.
 *
 * Run with: pnpm sync:generic-boilerplate
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { parse as parseToml } from 'smol-toml'

const GENERIC_BOILERPLATE_REPO =
  'https://github.com/fohte/generic-boilerplate.git'

// npm packages coupled to the boilerplate's `eslint.config.js` template
// (the config re-exports `@fohte/eslint-config` and pulls in these peers).
const NPM_ALLOWLIST: ReadonlySet<string> = new Set([
  '@eslint/eslintrc',
  '@fohte/eslint-config',
  'eslint',
  'eslint-plugin-storybook',
])

interface SyncResult {
  updated: boolean
  key: string
  file: string
  oldPackages: string[]
  newPackages: string[]
}

interface CargoToml {
  dependencies?: Record<string, unknown>
  'dev-dependencies'?: Record<string, unknown>
}

/**
 * Clone generic-boilerplate to a temporary directory
 */
function cloneRepo(tmpDir: string): void {
  console.log('Cloning generic-boilerplate...')
  execSync(
    `git clone --depth 1 --single-branch ${GENERIC_BOILERPLATE_REPO} ${tmpDir}`,
    { stdio: 'pipe' },
  )
}

/**
 * Get all directories under generated/
 */
function getGeneratedDirs(tmpDir: string): string[] {
  const generatedPath = path.join(tmpDir, 'generated')
  if (!fs.existsSync(generatedPath)) {
    return []
  }

  return fs
    .readdirSync(generatedPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => path.join(generatedPath, dirent.name))
}

/**
 * Extract dependencies and dev-dependencies from a Cargo.toml file
 */
function extractCargoPackagesFromFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return []
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const parsed = parseToml(content) as CargoToml

  return [
    ...Object.keys(parsed.dependencies ?? {}),
    ...Object.keys(parsed['dev-dependencies'] ?? {}),
  ]
}

/**
 * Extract devDependencies from a package.json file
 */
function extractNpmPackagesFromFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return []
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const parsed: unknown = JSON.parse(content)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('devDependencies' in parsed) ||
    typeof parsed.devDependencies !== 'object' ||
    parsed.devDependencies === null
  ) {
    return []
  }

  return Object.keys(parsed.devDependencies)
}

/**
 * Scan all generated/* directories and extract packages
 */
function extractAllPackages(tmpDir: string): {
  npmPackages: string[]
  cargoPackages: string[]
} {
  const dirs = getGeneratedDirs(tmpDir)
  const allNpmPackages = new Set<string>()
  const allCargoPackages = new Set<string>()

  for (const dir of dirs) {
    const packageJsonPath = path.join(dir, 'package.json')
    for (const pkg of extractNpmPackagesFromFile(packageJsonPath)) {
      if (NPM_ALLOWLIST.has(pkg)) {
        allNpmPackages.add(pkg)
      }
    }

    const cargoTomlPath = path.join(dir, 'Cargo.toml')
    for (const pkg of extractCargoPackagesFromFile(cargoTomlPath)) {
      allCargoPackages.add(pkg)
    }
  }

  return {
    npmPackages: [...allNpmPackages].sort(),
    cargoPackages: [...allCargoPackages].sort(),
  }
}

/**
 * Update content between markers
 *
 * Markers format:
 *   // @auto-generated sync:generic-boilerplate:<key> start
 *   matchPackageNames: [...] or matchDepNames: [...]
 *   // @auto-generated sync:generic-boilerplate:<key> end
 */
function updateMarkerSection(
  content: string,
  key: string,
  packages: string[],
): { content: string; oldPackages: string[]; updated: boolean } {
  const startMarker = `// @auto-generated sync:generic-boilerplate:${key} start`
  const endMarker = `// @auto-generated sync:generic-boilerplate:${key} end`

  const startIndex = content.indexOf(startMarker)
  const endIndex = content.indexOf(endMarker)

  if (startIndex === -1 || endIndex === -1) {
    console.error(`Could not find markers for ${key}`)
    return { content, oldPackages: [], updated: false }
  }

  const before = content.slice(0, startIndex + startMarker.length)
  const after = content.slice(endIndex)
  const between = content.slice(startIndex + startMarker.length, endIndex)

  // Detect existing key (matchPackageNames or matchDepNames)
  const packageKeyMatch = between.match(/match(?:Package|Dep)Names/)
  if (!packageKeyMatch) {
    console.error(
      `Could not find matchPackageNames or matchDepNames for ${key}`,
    )
    return { content, oldPackages: [], updated: false }
  }
  const packageKey = packageKeyMatch[0]

  // Extract old packages from between
  const oldPackages = (between.match(/'[^']+'/g) || []).map((p) =>
    p.replace(/'/g, ''),
  )

  // Check if update is needed
  if (JSON.stringify(oldPackages.sort()) === JSON.stringify(packages.sort())) {
    return { content, oldPackages, updated: false }
  }

  // Format new packages, preserving the existing key
  const indent = '        '
  const formattedPackages =
    packages.length > 0
      ? `\n      ${packageKey}: [\n${packages.map((p) => `${indent}'${p}',`).join('\n')}\n      ],\n      `
      : `\n      ${packageKey}: [],\n      `

  return {
    content: before + formattedPackages + after,
    oldPackages,
    updated: true,
  }
}

/**
 * Update a config file with the given package lists
 */
function updateConfigFile(
  filePath: string,
  updates: { key: string; packages: string[] }[],
): SyncResult[] {
  let content = fs.readFileSync(filePath, 'utf-8')
  const results: SyncResult[] = []

  for (const { key, packages } of updates) {
    const result = updateMarkerSection(content, key, packages)
    content = result.content

    results.push({
      updated: result.updated,
      key,
      file: filePath,
      oldPackages: result.oldPackages,
      newPackages: packages,
    })

    if (result.updated) {
      console.log(`${path.basename(filePath)}: ${key} updated`)
    } else {
      console.log(`${path.basename(filePath)}: ${key} - No changes needed`)
    }
  }

  fs.writeFileSync(filePath, content)

  return results
}

/**
 * Main function
 */
function main(): void {
  const rootDir = process.cwd()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generic-boilerplate-'))

  try {
    cloneRepo(tmpDir)

    console.log('\nExtracting packages from generic-boilerplate...')
    const { npmPackages, cargoPackages } = extractAllPackages(tmpDir)

    console.log(
      `  npm devDependencies (allowlisted): ${npmPackages.join(', ')}`,
    )
    console.log(`  cargo packages: ${cargoPackages.join(', ')}`)

    console.log('\nUpdating config files...')

    const nodeResults = updateConfigFile(path.join(rootDir, 'node.json5'), [
      { key: 'npm-packages', packages: npmPackages },
    ])

    const rustResults = updateConfigFile(path.join(rootDir, 'rust.json5'), [
      { key: 'cargo-packages', packages: cargoPackages },
    ])

    console.log('\n=== Summary ===')
    const allResults = [...nodeResults, ...rustResults]
    const updatedCount = allResults.filter((r) => r.updated).length

    if (updatedCount > 0) {
      console.log(`Updated ${String(updatedCount)} section(s):`)
      for (const result of allResults) {
        if (result.updated) {
          console.log(`  - ${path.basename(result.file)} (${result.key})`)
          console.log(`    Old: ${result.oldPackages.join(', ')}`)
          console.log(`    New: ${result.newPackages.join(', ')}`)
        }
      }
    } else {
      console.log('No changes needed. All package lists are up to date.')
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error: unknown) {
  console.error('Error:', error)
  process.exit(1)
}

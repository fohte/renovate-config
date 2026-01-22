/**
 * Syncs package lists from generic-boilerplate to renovate-config.
 *
 * This script:
 * 1. Clones generic-boilerplate (shallow)
 * 2. Scans all generated/* directories for package.json and .mise.toml
 * 3. Updates base.json5 and node.json5 with the extracted package names
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

interface SyncResult {
  updated: boolean
  key: string
  file: string
  oldPackages: string[]
  newPackages: string[]
}

interface MiseToml {
  tools?: Record<string, unknown>
}

interface PackageJson {
  devDependencies?: Record<string, string>
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
 * Extract mise tools from a .mise.toml file
 */
function extractMiseToolsFromFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return []
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const parsed = parseToml(content) as MiseToml

  if (!parsed.tools) {
    return []
  }

  return Object.keys(parsed.tools)
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

  const packages: string[] = []

  if (parsed.dependencies) {
    packages.push(...Object.keys(parsed.dependencies))
  }

  if (parsed['dev-dependencies']) {
    packages.push(...Object.keys(parsed['dev-dependencies']))
  }

  return packages
}

/**
 * Extract devDependencies from a package.json file
 */
function extractNpmPackagesFromFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return []
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  const pkg = JSON.parse(content) as PackageJson

  if (!pkg.devDependencies) {
    return []
  }

  return Object.keys(pkg.devDependencies)
}

/**
 * Scan all generated/* directories and extract packages
 */
function extractAllPackages(tmpDir: string): {
  miseTools: string[]
  npmPackages: string[]
  miseNpmBackendTools: string[]
  cargoPackages: string[]
} {
  const dirs = getGeneratedDirs(tmpDir)
  const allMiseTools = new Set<string>()
  const allNpmPackages = new Set<string>()
  const allMiseNpmBackendTools = new Set<string>()
  const allCargoPackages = new Set<string>()

  for (const dir of dirs) {
    const miseTomlPath = path.join(dir, '.mise.toml')
    const tools = extractMiseToolsFromFile(miseTomlPath)

    for (const tool of tools) {
      if (tool.startsWith('npm:')) {
        allMiseNpmBackendTools.add(tool)
      } else {
        allMiseTools.add(tool)
      }
    }

    const packageJsonPath = path.join(dir, 'package.json')
    const packages = extractNpmPackagesFromFile(packageJsonPath)

    for (const pkg of packages) {
      allNpmPackages.add(pkg)
    }

    const cargoTomlPath = path.join(dir, 'Cargo.toml')
    const cargoPackages = extractCargoPackagesFromFile(cargoTomlPath)

    for (const pkg of cargoPackages) {
      allCargoPackages.add(pkg)
    }
  }

  return {
    miseTools: [...allMiseTools].sort(),
    npmPackages: [...allNpmPackages].sort(),
    miseNpmBackendTools: [...allMiseNpmBackendTools].sort(),
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
async function main(): Promise<void> {
  const rootDir = process.cwd()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generic-boilerplate-'))

  try {
    cloneRepo(tmpDir)

    console.log('\nExtracting packages from generic-boilerplate...')
    const { miseTools, npmPackages, miseNpmBackendTools, cargoPackages } =
      extractAllPackages(tmpDir)

    console.log(`  mise tools: ${miseTools.join(', ')}`)
    console.log(`  npm devDependencies: ${npmPackages.join(', ')}`)
    console.log(`  mise npm backend: ${miseNpmBackendTools.join(', ')}`)
    console.log(`  cargo packages: ${cargoPackages.join(', ')}`)

    console.log('\nUpdating config files...')

    const baseResults = updateConfigFile(path.join(rootDir, 'base.json5'), [
      { key: 'mise-tools', packages: miseTools },
      { key: 'mise-npm-backend', packages: miseNpmBackendTools },
    ])

    const nodeResults = updateConfigFile(path.join(rootDir, 'node.json5'), [
      { key: 'npm-packages', packages: npmPackages },
    ])

    const rustResults = updateConfigFile(path.join(rootDir, 'rust.json5'), [
      { key: 'cargo-packages', packages: cargoPackages },
    ])

    console.log('\n=== Summary ===')
    const allResults = [...baseResults, ...nodeResults, ...rustResults]
    const updatedCount = allResults.filter((r) => r.updated).length

    if (updatedCount > 0) {
      console.log(`Updated ${updatedCount} section(s):`)
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

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})

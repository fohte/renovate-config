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
import * as path from 'path'
import { parse as parseToml } from 'smol-toml'

const GENERIC_BOILERPLATE_REPO =
  'https://github.com/fohte/generic-boilerplate.git'

interface SyncResult {
  updated: boolean
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
} {
  const dirs = getGeneratedDirs(tmpDir)
  const allMiseTools = new Set<string>()
  const allNpmPackages = new Set<string>()
  const allMiseNpmBackendTools = new Set<string>()

  for (const dir of dirs) {
    // Extract mise tools
    const miseTomlPath = path.join(dir, '.mise.toml')
    const tools = extractMiseToolsFromFile(miseTomlPath)

    for (const tool of tools) {
      if (tool.startsWith('npm:')) {
        allMiseNpmBackendTools.add(tool)
      } else {
        allMiseTools.add(tool)
      }
    }

    // Extract npm packages
    const packageJsonPath = path.join(dir, 'package.json')
    const packages = extractNpmPackagesFromFile(packageJsonPath)

    for (const pkg of packages) {
      allNpmPackages.add(pkg)
    }
  }

  return {
    miseTools: [...allMiseTools].sort(),
    npmPackages: [...allNpmPackages].sort(),
    miseNpmBackendTools: [...allMiseNpmBackendTools].sort(),
  }
}

/**
 * Update base.json5 with mise tools
 */
function updateBaseJson5(rootDir: string, miseTools: string[]): SyncResult {
  const filePath = path.join(rootDir, 'base.json5')
  const content = fs.readFileSync(filePath, 'utf-8')

  // Find and update the generic-boilerplate mise section
  const sectionRegex =
    /(\/\/ generic-boilerplate[\s\S]*?\{[\s\S]*?matchManagers:\s*\['mise'\],[\s\S]*?matchPackageNames:\s*\[)([^\]]*?)(\],[\s\S]*?enabled:\s*false,[\s\S]*?\},)/

  const match = content.match(sectionRegex)
  if (!match) {
    console.error(
      'Could not find generic-boilerplate mise section in base.json5',
    )
    return {
      updated: false,
      file: filePath,
      oldPackages: [],
      newPackages: miseTools,
    }
  }

  const oldPackagesStr = match[2]
  const oldPackages = (oldPackagesStr.match(/'[^']+'/g) || []).map((p) =>
    p.replace(/'/g, ''),
  )

  if (JSON.stringify(oldPackages.sort()) === JSON.stringify(miseTools.sort())) {
    console.log('base.json5: No changes needed')
    return {
      updated: false,
      file: filePath,
      oldPackages,
      newPackages: miseTools,
    }
  }

  const indent = '        '
  const formattedPackages = miseTools.map((p) => `${indent}'${p}',`).join('\n')
  const updatedContent = content.replace(
    sectionRegex,
    `$1\n${formattedPackages}\n      $3`,
  )

  fs.writeFileSync(filePath, updatedContent)
  console.log('base.json5: Updated')

  return { updated: true, file: filePath, oldPackages, newPackages: miseTools }
}

/**
 * Update node.json5 with npm packages and mise npm backend tools
 */
function updateNodeJson5(
  rootDir: string,
  npmPackages: string[],
  miseNpmBackendTools: string[],
): SyncResult[] {
  const filePath = path.join(rootDir, 'node.json5')
  let content = fs.readFileSync(filePath, 'utf-8')
  const results: SyncResult[] = []

  // Update npm devDependencies section
  const npmSectionRegex =
    /(\/\/ npm devDependencies[\s\S]*?matchPackageNames:\s*\[)([^\]]*?)(\],[\s\S]*?enabled:\s*false,[\s\S]*?\},)/

  const npmMatch = content.match(npmSectionRegex)
  if (npmMatch) {
    const oldNpmPackagesStr = npmMatch[2]
    const oldNpmPackages = (oldNpmPackagesStr.match(/'[^']+'/g) || []).map(
      (p) => p.replace(/'/g, ''),
    )

    if (
      JSON.stringify(oldNpmPackages.sort()) !==
      JSON.stringify(npmPackages.sort())
    ) {
      const indent = '        '
      const formattedPackages = npmPackages
        .map((p) => `${indent}'${p}',`)
        .join('\n')
      content = content.replace(
        npmSectionRegex,
        `$1\n${formattedPackages}\n      $3`,
      )
      results.push({
        updated: true,
        file: `${filePath} (npm packages)`,
        oldPackages: oldNpmPackages,
        newPackages: npmPackages,
      })
      console.log('node.json5: npm packages updated')
    } else {
      console.log('node.json5: npm packages - No changes needed')
      results.push({
        updated: false,
        file: `${filePath} (npm packages)`,
        oldPackages: oldNpmPackages,
        newPackages: npmPackages,
      })
    }
  }

  // Update mise npm backend section
  const miseSectionRegex =
    /(\/\/ mise npm backend[\s\S]*?matchManagers:\s*\['mise'\],[\s\S]*?matchPackageNames:\s*\[)([^\]]*?)(\],[\s\S]*?enabled:\s*false,[\s\S]*?\},)/

  const miseMatch = content.match(miseSectionRegex)
  if (miseMatch) {
    const oldMisePackagesStr = miseMatch[2]
    const oldMisePackages = (oldMisePackagesStr.match(/'[^']+'/g) || []).map(
      (p) => p.replace(/'/g, ''),
    )

    if (
      JSON.stringify(oldMisePackages.sort()) !==
      JSON.stringify(miseNpmBackendTools.sort())
    ) {
      const indent = '        '
      const formattedPackages = miseNpmBackendTools
        .map((p) => `${indent}'${p}',`)
        .join('\n')
      content = content.replace(
        miseSectionRegex,
        `$1\n${formattedPackages}\n      $3`,
      )
      results.push({
        updated: true,
        file: `${filePath} (mise npm backend)`,
        oldPackages: oldMisePackages,
        newPackages: miseNpmBackendTools,
      })
      console.log('node.json5: mise npm backend updated')
    } else {
      console.log('node.json5: mise npm backend - No changes needed')
      results.push({
        updated: false,
        file: `${filePath} (mise npm backend)`,
        oldPackages: oldMisePackages,
        newPackages: miseNpmBackendTools,
      })
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
  const tmpDir = fs.mkdtempSync('/tmp/generic-boilerplate-')

  try {
    cloneRepo(tmpDir)

    console.log('\nExtracting packages from generic-boilerplate...')
    const { miseTools, npmPackages, miseNpmBackendTools } =
      extractAllPackages(tmpDir)

    console.log(`  mise tools: ${miseTools.join(', ')}`)
    console.log(`  npm devDependencies: ${npmPackages.join(', ')}`)
    console.log(`  mise npm backend: ${miseNpmBackendTools.join(', ')}`)

    console.log('\nUpdating config files...')
    const baseResult = updateBaseJson5(rootDir, miseTools)
    const nodeResults = updateNodeJson5(
      rootDir,
      npmPackages,
      miseNpmBackendTools,
    )

    console.log('\n=== Summary ===')
    const allResults = [baseResult, ...nodeResults]
    const updatedCount = allResults.filter((r) => r.updated).length

    if (updatedCount > 0) {
      console.log(`Updated ${updatedCount} section(s):`)
      for (const result of allResults) {
        if (result.updated) {
          console.log(`  - ${result.file}`)
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

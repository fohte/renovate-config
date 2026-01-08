/**
 * Syncs package lists from generic-boilerplate to renovate-config.
 *
 * This script:
 * 1. Clones generic-boilerplate (shallow)
 * 2. Extracts package names from generated/node/package.json and generated/node/.mise.toml
 * 3. Updates base.json5 and node.json5 with the extracted package names
 *
 * Run with: npx tsx scripts/sync-generic-boilerplate.ts
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

const GENERIC_BOILERPLATE_REPO =
  'https://github.com/fohte/generic-boilerplate.git'
const GENERATED_NODE_PATH = 'generated/node'
const GENERATED_BASE_PATH = 'generated/base'

interface SyncResult {
  updated: boolean
  file: string
  oldPackages: string[]
  newPackages: string[]
}

/**
 * Clone generic-boilerplate to a temporary directory
 */
function cloneRepo(tmpDir: string): void {
  console.log('Cloning generic-boilerplate...')
  execSync(
    `git clone --depth 1 --single-branch ${GENERIC_BOILERPLATE_REPO} ${tmpDir}`,
    {
      stdio: 'pipe',
    },
  )
}

/**
 * Extract devDependencies from package.json
 */
function extractNpmPackages(tmpDir: string): string[] {
  const packageJsonPath = path.join(tmpDir, GENERATED_NODE_PATH, 'package.json')
  const content = fs.readFileSync(packageJsonPath, 'utf-8')
  const pkg = JSON.parse(content) as {
    devDependencies?: Record<string, string>
  }

  if (!pkg.devDependencies) {
    return []
  }

  return Object.keys(pkg.devDependencies).sort()
}

/**
 * Parse tools from a .mise.toml content
 */
function parseMiseTomlTools(content: string): string[] {
  const tools: string[] = []

  // Parse [tools] section
  const toolsSectionMatch = content.match(/\[tools\]([\s\S]*?)(?:\n\[|$)/)
  if (!toolsSectionMatch) {
    return []
  }

  const toolsSection = toolsSectionMatch[1]

  // Match tool definitions: key = "version" or "key" = "version"
  const toolPattern = /^["']?([^"'\s=]+)["']?\s*=\s*["']([^"']+)["']/gm
  let match: RegExpExecArray | null

  while ((match = toolPattern.exec(toolsSection)) !== null) {
    tools.push(match[1])
  }

  return tools
}

/**
 * Extract mise tools from generated/node/.mise.toml
 */
function extractMiseTools(tmpDir: string): string[] {
  const miseTomlPath = path.join(tmpDir, GENERATED_NODE_PATH, '.mise.toml')
  const content = fs.readFileSync(miseTomlPath, 'utf-8')
  return parseMiseTomlTools(content).sort()
}

/**
 * Extract npm backend tools from generated/base/.mise.toml
 * These are tools with 'npm:' prefix that are used in non-node projects
 */
function extractMiseNpmBackendTools(tmpDir: string): string[] {
  const miseTomlPath = path.join(tmpDir, GENERATED_BASE_PATH, '.mise.toml')
  const content = fs.readFileSync(miseTomlPath, 'utf-8')
  const tools = parseMiseTomlTools(content)
  return tools.filter((t) => t.startsWith('npm:')).sort()
}

/**
 * Update matchPackageNames array in a JSON5 file for a specific section
 * Uses regex to preserve comments and formatting
 */
function updatePackageNamesInSection(
  content: string,
  sectionComment: string,
  newPackages: string[],
  matchManagersFilter?: string,
): { updated: boolean; content: string; oldPackages: string[] } {
  // Find the section by its comment marker
  const sectionPattern = new RegExp(
    `(// ${sectionComment}[\\s\\S]*?\\{[\\s\\S]*?matchPackageNames:\\s*\\[)([^\\]]*)(\\][\\s\\S]*?enabled:\\s*false[\\s\\S]*?\\})`,
    'g',
  )

  let oldPackages: string[] = []
  let updated = false

  const updatedContent = content.replace(
    sectionPattern,
    (fullMatch, before, packagesStr, after) => {
      // If matchManagers filter is specified, check if this is the right section
      if (matchManagersFilter) {
        const matchManagersCheck = new RegExp(
          `matchManagers:\\s*\\['${matchManagersFilter}'\\]`,
        )
        if (!fullMatch.match(matchManagersCheck)) {
          return fullMatch
        }
      }

      // Extract old packages
      oldPackages = (packagesStr.match(/'[^']+'/g) || []).map((p: string) =>
        p.replace(/'/g, ''),
      )

      // Format new packages with proper indentation
      const indent = '        '
      const formattedPackages = newPackages
        .map((p) => `${indent}'${p}',`)
        .join('\n')

      const newSection = `${before}\n${formattedPackages}\n      ${after}`

      if (
        JSON.stringify(oldPackages.sort()) !==
        JSON.stringify(newPackages.sort())
      ) {
        updated = true
      }

      return newSection
    },
  )

  return { updated, content: updatedContent, oldPackages }
}

/**
 * Update base.json5 with mise tools
 */
function updateBaseJson5(rootDir: string, miseTools: string[]): SyncResult {
  const filePath = path.join(rootDir, 'base.json5')
  const content = fs.readFileSync(filePath, 'utf-8')

  // Find and update the generic-boilerplate mise section
  // Looking for the pattern with matchManagers: ['mise'] and enabled: false
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

  // Extract old packages
  const oldPackagesStr = match[2]
  const oldPackages = (oldPackagesStr.match(/'[^']+'/g) || []).map((p) =>
    p.replace(/'/g, ''),
  )

  // Check if update is needed
  if (JSON.stringify(oldPackages.sort()) === JSON.stringify(miseTools.sort())) {
    console.log('base.json5: No changes needed')
    return {
      updated: false,
      file: filePath,
      oldPackages,
      newPackages: miseTools,
    }
  }

  // Format new packages
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
  // Find the section with the comment "npm devDependencies from template/package.json.jinja"
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
    // Clone generic-boilerplate
    cloneRepo(tmpDir)

    // Extract packages
    console.log('\nExtracting packages from generic-boilerplate...')
    const npmPackages = extractNpmPackages(tmpDir)
    const miseTools = extractMiseTools(tmpDir)
    const miseNpmBackendTools = extractMiseNpmBackendTools(tmpDir)

    console.log(`  npm devDependencies: ${npmPackages.join(', ')}`)
    console.log(`  mise tools: ${miseTools.join(', ')}`)
    console.log(`  mise npm backend: ${miseNpmBackendTools.join(', ')}`)

    // Update config files
    console.log('\nUpdating config files...')
    const baseResult = updateBaseJson5(rootDir, miseTools)
    const nodeResults = updateNodeJson5(
      rootDir,
      npmPackages,
      miseNpmBackendTools,
    )

    // Summary
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
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})

import { describe, expect, it } from 'vitest'
import {
  describeWithRenovate,
  type SetupOptions,
} from './helpers/with-renovate'

// Test PR title format according to release-please configuration in base.json5:
//   | Target          | major        | minor        | patch        | pin          |
//   |-----------------|--------------|--------------|--------------|--------------|
//   | dependencies    | deps!:       | deps:        | deps:        | chore(deps): |
//   | devDependencies | chore:       | chore:       | chore:       | chore:       |
//   | github-actions  | ci:          | ci:          | ci:          | ci:          |
//   | copier          | chore(deps): | chore(deps): | chore(deps): | chore(deps): |

interface TestCase {
  category: string
  description: string
  options: Omit<SetupOptions, 'dryRunMode'>
  depName: string
  expectedPrefix: RegExp
  updateType: string
}

const testCases: TestCase[] = [
  // dependencies
  {
    category: 'dependencies',
    description: 'major update',
    options: {
      fixtures: ['pr-title-major/.mise.toml'],
      mockCrates: [{ name: 'test-major', versions: ['1.0.0', '2.0.0'] }],
    },
    depName: 'cargo:test-major',
    expectedPrefix: /^deps!: /,
    updateType: 'major',
  },
  {
    category: 'dependencies',
    description: 'minor update',
    options: {
      fixtures: ['.mise.toml'],
      mockCrates: [{ name: 'example-crate', versions: ['1.0.0', '1.1.0'] }],
    },
    depName: 'cargo:example-crate',
    expectedPrefix: /^deps: /,
    updateType: 'minor',
  },
  {
    category: 'dependencies',
    description: 'patch update',
    options: {
      fixtures: ['pr-title-patch/.mise.toml'],
      mockCrates: [{ name: 'test-patch', versions: ['1.0.0', '1.0.1'] }],
    },
    depName: 'cargo:test-patch',
    expectedPrefix: /^deps: /,
    updateType: 'patch',
  },
  {
    category: 'dependencies',
    description: 'pin update',
    options: {
      fixtures: ['pr-title-npm-pin/package.json'],
      mockNpmPackages: [{ name: 'test-pkg-pin', versions: ['1.0.0'] }],
    },
    depName: 'test-pkg-pin',
    expectedPrefix: /^chore\(deps\): /,
    updateType: 'pin',
  },
  // devDependencies
  {
    category: 'devDependencies',
    description: 'minor update',
    options: {
      fixtures: ['pr-title-npm-dev/package.json'],
      mockNpmPackages: [{ name: 'test-pkg-dev', versions: ['1.0.0', '1.1.0'] }],
    },
    depName: 'test-pkg-dev',
    expectedPrefix: /^chore: /,
    updateType: 'minor',
  },
  // copier
  {
    category: 'copier',
    description: 'minor update',
    options: {
      fixtures: ['.copier-answers.yml'],
      mockRepos: [{ name: 'test-template', tags: ['v1.0.0', 'v1.1.0'] }],
    },
    depName: 'test-template',
    expectedPrefix: /^chore\(deps\): /,
    updateType: 'minor',
  },
  // github-actions
  {
    category: 'github-actions',
    description: 'minor update',
    options: {
      fixtures: ['github-actions/.github/workflows/test.yml'],
      mockGitHubRepos: [
        { name: 'actions/checkout', tags: ['v1.0.0', 'v1.1.0'] },
      ],
    },
    depName: 'actions/checkout',
    expectedPrefix: /^ci: /,
    updateType: 'minor',
  },
]

describe('PR title format for release-please', () => {
  // Group test cases by category
  const categories = [...new Set(testCases.map((tc) => tc.category))]

  for (const category of categories) {
    describe(category, () => {
      const cases = testCases.filter((tc) => tc.category === category)

      for (const tc of cases) {
        describeWithRenovate(
          tc.description,
          { ...tc.options, dryRunMode: 'full' },
          (ctx) => {
            it(`should use ${tc.expectedPrefix.source} prefix`, () => {
              const branch = ctx
                .getBranches()
                .find((b) =>
                  b.upgrades?.some((u) => u.depName?.includes(tc.depName)),
                )

              expect(branch).toMatchObject({
                prTitle: expect.stringMatching(tc.expectedPrefix),
                upgrades: expect.arrayContaining([
                  expect.objectContaining({
                    depName: expect.stringContaining(tc.depName),
                    updateType: tc.updateType,
                  }),
                ]),
              })
            })
          },
        )
      }
    })
  }
})

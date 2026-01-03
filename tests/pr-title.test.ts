import { describe, expect, it } from 'vitest'
import { describeWithRenovate } from './helpers/with-renovate'

// Test PR title format according to release-please configuration in base.json5:
//   | Target          | major    | minor  | patch  | pin    |
//   |-----------------|----------|--------|--------|--------|
//   | dependencies    | deps!:   | deps:  | deps:  | chore(deps): |
//   | devDependencies | chore:   | chore: | chore: | chore: |
//   | github-actions  | ci:      | ci:    | ci:    | ci:    |

describe('PR title format for release-please', () => {
  describe('dependencies', () => {
    describeWithRenovate(
      'major update',
      {
        fixtures: ['pr-title-major/.mise.toml'],
        mockCrates: [{ name: 'test-major', versions: ['1.0.0', '2.0.0'] }],
        dryRunMode: 'full',
      },
      (ctx) => {
        it('should use deps!: prefix', () => {
          const branch = ctx
            .getBranches()
            .find((b) =>
              b.upgrades?.some((u) => u.depName === 'cargo:test-major'),
            )

          expect(branch).toMatchObject({
            prTitle: expect.stringMatching(/^deps!: /),
            upgrades: expect.arrayContaining([
              expect.objectContaining({
                depName: 'cargo:test-major',
                updateType: 'major',
              }),
            ]),
          })
        })
      },
    )

    describeWithRenovate(
      'minor update',
      {
        fixtures: ['.mise.toml'],
        mockCrates: [{ name: 'example-crate', versions: ['1.0.0', '1.1.0'] }],
        dryRunMode: 'full',
      },
      (ctx) => {
        it('should use deps: prefix', () => {
          const branch = ctx
            .getBranches()
            .find((b) =>
              b.upgrades?.some((u) => u.depName === 'cargo:example-crate'),
            )

          expect(branch).toMatchObject({
            prTitle: expect.stringMatching(/^deps: /),
            upgrades: expect.arrayContaining([
              expect.objectContaining({
                depName: 'cargo:example-crate',
                updateType: 'minor',
              }),
            ]),
          })
        })
      },
    )

    describeWithRenovate(
      'patch update',
      {
        fixtures: ['pr-title-patch/.mise.toml'],
        mockCrates: [{ name: 'test-patch', versions: ['1.0.0', '1.0.1'] }],
        dryRunMode: 'full',
      },
      (ctx) => {
        it('should use deps: prefix', () => {
          const branch = ctx
            .getBranches()
            .find((b) =>
              b.upgrades?.some((u) => u.depName === 'cargo:test-patch'),
            )

          expect(branch).toMatchObject({
            prTitle: expect.stringMatching(/^deps: /),
            upgrades: expect.arrayContaining([
              expect.objectContaining({
                depName: 'cargo:test-patch',
                updateType: 'patch',
              }),
            ]),
          })
        })
      },
    )

    describeWithRenovate(
      'pin update',
      {
        fixtures: ['pr-title-npm-pin/package.json'],
        mockNpmPackages: [{ name: 'test-pkg-pin', versions: ['1.0.0'] }],
        dryRunMode: 'full',
      },
      (ctx) => {
        it('should use chore(deps): prefix', () => {
          const branch = ctx
            .getBranches()
            .find((b) => b.upgrades?.some((u) => u.depName === 'test-pkg-pin'))

          expect(branch).toMatchObject({
            prTitle: expect.stringMatching(/^chore\(deps\): /),
            upgrades: expect.arrayContaining([
              expect.objectContaining({
                depName: 'test-pkg-pin',
                updateType: 'pin',
              }),
            ]),
          })
        })
      },
    )
  })

  describe('devDependencies', () => {
    describeWithRenovate(
      'minor update',
      {
        fixtures: ['pr-title-npm-dev/package.json'],
        mockNpmPackages: [
          { name: 'test-pkg-dev', versions: ['1.0.0', '1.1.0'] },
        ],
        dryRunMode: 'full',
      },
      (ctx) => {
        it('should use chore: prefix', () => {
          const branch = ctx
            .getBranches()
            .find((b) => b.upgrades?.some((u) => u.depName === 'test-pkg-dev'))

          expect(branch).toMatchObject({
            prTitle: expect.stringMatching(/^chore: /),
            upgrades: expect.arrayContaining([
              expect.objectContaining({
                depName: 'test-pkg-dev',
                updateType: 'minor',
              }),
            ]),
          })
        })
      },
    )
  })

  // TODO: github-actions tests require mocking the GitHub API (github-tags datasource)
  // since mockRepos (local git repos) don't work with the github-actions manager
  // which expects owner/repo@version format.
  //
  // describe('github-actions', () => { ... })
})

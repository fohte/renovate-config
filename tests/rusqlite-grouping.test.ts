import { expect, it } from 'vitest'

import {
  describeWithRenovate,
  type RenovateTestContext,
} from './helpers/with-renovate'

const cargoFixture = {
  fixtures: [],
  inlineFiles: {
    'Cargo.toml':
      '[package]\nname = "test-rusqlite-grouping"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nrusqlite = "=0.40.2"\nrusqlite_migration = "=2.6.0"\n',
  },
  additionalConfigs: ['rust.json5'],
}

function rusqliteBranches(ctx: RenovateTestContext) {
  return ctx
    .getBranches()
    .filter(
      (branch) =>
        branch.upgrades?.some((upgrade) =>
          ['rusqlite', 'rusqlite_migration'].includes(upgrade.depName ?? ''),
        ) ?? false,
    )
    .map((branch) => ({
      branchName: branch.branchName,
      prTitle: branch.prTitle,
      upgrades: branch.upgrades?.map(
        ({ depName, currentVersion, newVersion, updateType }) => ({
          depName,
          currentVersion,
          newVersion,
          updateType,
        }),
      ),
    }))
}

describeWithRenovate(
  'rusqlite dependency grouping for the actual minor updates',
  {
    ...cargoFixture,
    mockCrates: [
      { name: 'rusqlite', versions: ['0.40.2', '0.43.0'] },
      { name: 'rusqlite_migration', versions: ['2.6.0', '2.7.0'] },
    ],
  },
  (ctx) => {
    it('groups the Cargo 0.x update with rusqlite_migration', () => {
      expect(rusqliteBranches(ctx)).toEqual([
        {
          branchName: 'renovate/rusqlite-dependencies',
          prTitle: 'deps: update rusqlite dependencies',
          upgrades: [
            {
              depName: 'rusqlite',
              currentVersion: '0.40.2',
              newVersion: '0.43.0',
              updateType: 'minor',
            },
            {
              depName: 'rusqlite_migration',
              currentVersion: '2.6.0',
              newVersion: '2.7.0',
              updateType: 'minor',
            },
          ],
        },
      ])
    })
  },
)

describeWithRenovate(
  'rusqlite dependency grouping across update types',
  {
    ...cargoFixture,
    mockCrates: [
      { name: 'rusqlite', versions: ['0.40.2', '1.0.0'] },
      { name: 'rusqlite_migration', versions: ['2.6.0', '2.7.0'] },
    ],
  },
  (ctx) => {
    it('groups major and minor updates into one branch', () => {
      expect(rusqliteBranches(ctx)).toEqual([
        {
          branchName: 'renovate/rusqlite-dependencies',
          prTitle: 'deps: update rusqlite dependencies',
          upgrades: [
            {
              depName: 'rusqlite',
              currentVersion: '0.40.2',
              newVersion: '1.0.0',
              updateType: 'major',
            },
            {
              depName: 'rusqlite_migration',
              currentVersion: '2.6.0',
              newVersion: '2.7.0',
              updateType: 'minor',
            },
          ],
        },
      ])
    })
  },
)

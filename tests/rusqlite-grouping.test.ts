import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'rusqlite dependency grouping',
  {
    fixtures: [],
    inlineFiles: {
      'Cargo.toml':
        '[package]\nname = "test-rusqlite-grouping"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nrusqlite = "=0.40.2"\nrusqlite_migration = "=2.6.0"\n',
    },
    mockCrates: [
      { name: 'rusqlite', versions: ['0.40.2', '1.0.0'] },
      { name: 'rusqlite_migration', versions: ['2.6.0', '2.7.0'] },
    ],
    additionalConfigs: ['rust.json5'],
  },
  (ctx) => {
    it('groups major and minor updates into one branch', () => {
      expect(
        ctx
          .getBranches()
          .filter(
            (branch) =>
              branch.upgrades?.some((upgrade) =>
                ['rusqlite', 'rusqlite_migration'].includes(
                  upgrade.depName ?? '',
                ),
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
          })),
      ).toEqual([
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

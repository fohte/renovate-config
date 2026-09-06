import { expect, it } from 'vitest'

import { branchUpgradeManagers } from './helpers/branch-upgrade-managers'
import { describeWithRenovate } from './helpers/with-renovate'

// No negative "major" test: Rust has stayed on major version 1 since 2015
// and its edition system exists specifically so language changes never
// require a major bump, so updateType: 'major' structurally never occurs
// for real Rust version strings.

describeWithRenovate(
  'rust toolchain grouping and automerge',
  {
    fixtures: [],
    inlineFiles: {
      'rust-toolchain.toml':
        '[toolchain]\nchannel = "1.96.0"\ncomponents = ["clippy", "rustfmt"]\n',
      'backend/Dockerfile': 'FROM rust:1.96.0-slim AS build\n',
    },
    mockRustReleases: [{ version: '1.96.0' }, { version: '1.98.0' }],
    mockDockerImages: [{ name: 'rust', tags: ['1.96.0-slim', '1.98.0-slim'] }],
    additionalConfigs: ['rust.json5'],
  },
  (ctx) => {
    it('groups the rust-toolchain and dockerfile upgrades into one automerged branch', () => {
      expect(branchUpgradeManagers(ctx, 'rust')).toEqual({
        found: true,
        automerge: true,
        managers: ['dockerfile', 'rust-toolchain'],
      })
    })
  },
)

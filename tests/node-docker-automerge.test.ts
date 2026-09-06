import { expect, it } from 'vitest'

import { branchAutomergeStatus } from './helpers/branch-automerge-status'
import { branchUpgradeManagers } from './helpers/branch-upgrade-managers'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'dockerfile automerge for node patch updates',
  {
    fixtures: [],
    inlineFiles: { Dockerfile: 'FROM node:1.2.0-slim AS base\n' },
    mockDockerImages: [{ name: 'node', tags: ['1.2.0-slim', '1.2.1-slim'] }],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should automerge a patch update for node in a Dockerfile', () => {
      expect(branchAutomergeStatus(ctx, 'node', 'patch')).toEqual({
        found: true,
        automerge: true,
      })
    })
  },
)

describeWithRenovate(
  'dockerfile automerge for node minor updates',
  {
    fixtures: [],
    inlineFiles: { Dockerfile: 'FROM node:1.2.0-slim AS base\n' },
    mockDockerImages: [
      { name: 'node', tags: ['1.2.0-slim', '1.2.1-slim', '1.3.0-slim'] },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should automerge a minor update for node', () => {
      expect(branchAutomergeStatus(ctx, 'node', 'minor')).toEqual({
        found: true,
        automerge: true,
      })
    })
  },
)

describeWithRenovate(
  'dockerfile automerge exclusion for node major updates',
  {
    fixtures: [],
    inlineFiles: { Dockerfile: 'FROM node:22.0.0-slim AS base\n' },
    mockDockerImages: [{ name: 'node', tags: ['22.0.0-slim', '24.0.0-slim'] }],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should not automerge a major update for node', () => {
      expect(branchAutomergeStatus(ctx, 'node', 'major')).toEqual({
        found: true,
        automerge: false,
      })
    })
  },
)

describeWithRenovate(
  'docker-compose automerge for node patch updates',
  {
    fixtures: [],
    inlineFiles: {
      'docker-compose.yml': 'services:\n  app:\n    image: node:1.2.0-slim\n',
    },
    mockDockerImages: [{ name: 'node', tags: ['1.2.0-slim', '1.2.1-slim'] }],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should automerge a patch update for node in docker-compose.yml', () => {
      expect(branchAutomergeStatus(ctx, 'node', 'patch')).toEqual({
        found: true,
        automerge: true,
      })
    })
  },
)

describeWithRenovate(
  'node grouping across mise and dockerfile',
  {
    fixtures: [],
    inlineFiles: {
      '.mise.toml': '[tools]\nnode = "1.2.0"\n',
      Dockerfile: 'FROM node:1.2.0-slim AS base\n',
    },
    mockNodeVersions: [{ version: 'v1.2.0' }, { version: 'v1.3.0' }],
    mockDockerImages: [{ name: 'node', tags: ['1.2.0-slim', '1.3.0-slim'] }],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('groups mise and dockerfile node minor upgrades into one automerged branch', () => {
      expect(branchUpgradeManagers(ctx, 'node')).toEqual({
        found: true,
        automerge: true,
        managers: ['dockerfile', 'mise'],
      })
    })
  },
)

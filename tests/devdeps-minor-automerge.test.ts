import { expect, it } from 'vitest'

import { branchAutomergeStatus } from './helpers/branch-automerge-status'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'automerge npm/bun devDependencies minor updates',
  {
    fixtures: ['devdeps-minor-automerge/package.json'],
    mockNpmPackages: [
      { name: 'test-pkg-devdeps-minor-stable', versions: ['1.0.0', '1.1.0'] },
      { name: 'test-pkg-devdeps-minor-0x', versions: ['0.1.0', '0.2.0'] },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    it('should automerge a minor update for a >=1.0.0 devDependency', () => {
      expect(
        branchAutomergeStatus(ctx, 'test-pkg-devdeps-minor-stable', 'minor'),
      ).toEqual({
        found: true,
        automerge: true,
      })
    })

    it('should not automerge a minor update for a 0.x devDependency', () => {
      expect(
        branchAutomergeStatus(ctx, 'test-pkg-devdeps-minor-0x', 'minor'),
      ).toEqual({
        found: true,
        automerge: false,
      })
    })
  },
)

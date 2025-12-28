import { expect, it } from 'vitest'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'lefthook customManager',
  {
    fixtures: ['lefthook.yml'],
    mockRepos: [{ name: 'config', tags: ['v1.0.0', 'v1.0.1', 'v1.1.0'] }],
    dryRunMode: 'lookup',
  },
  (ctx) => {
    it('should detect available updates', () => {
      const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml')
      const dep = lefthookFile.deps[0]

      expect(dep).toMatchObject({
        currentValue: 'v1.0.0',
        datasource: 'git-tags',
        updates: expect.arrayContaining([
          expect.objectContaining({
            newValue: 'v1.1.0',
            updateType: 'minor',
          }),
        ]),
      })
    })
  }
)

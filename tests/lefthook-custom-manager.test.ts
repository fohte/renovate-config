import { expect, it } from 'vitest'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'lefthook customManager',
  {
    fixtures: ['lefthook.yml', 'lefthook.yml.jinja'],
    mockRepos: [{ name: 'config', tags: ['v1.0.0', 'v1.0.1', 'v1.1.0'] }],
    additionalConfigs: ['lefthook.json5'],
  },
  (ctx) => {
    it('should detect available updates in lefthook.yml', () => {
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

    it('should detect available updates in lefthook.yml.jinja', () => {
      const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml.jinja')
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
  },
)

import { expect, it } from 'vitest'
import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate('lefthook customManager', ['lefthook.yml'], (ctx) => {
  it('should detect lefthook.yml as a package file', () => {
    const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml')
    expect(lefthookFile.packageFile).toBe('lefthook.yml')
  })

  it('should extract dependency from lefthook.yml', () => {
    const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml')
    expect(lefthookFile.deps).toMatchObject([
      {
        depName: 'fohte/lefthook-config',
        currentValue: 'v0.1.0',
        datasource: 'github-tags',
      },
    ])
  })

  it('should have correct autoReplaceStringTemplate', () => {
    const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml')
    expect(lefthookFile.autoReplaceStringTemplate).toBe(
      'ref: {{{newValue}}} # renovate: datasource={{{datasource}}} depName={{{depName}}}'
    )
  })

  it('should have updates for lefthook-config', () => {
    if (!process.env['GITHUB_TOKEN']) {
      throw new Error(
        'GITHUB_TOKEN is required for this test. ' +
          'Run: GITHUB_TOKEN=$(gh auth token) bun run test'
      )
    }

    const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml')
    const dep = lefthookFile.deps.find(
      (d) => d.depName === 'fohte/lefthook-config'
    )

    expect(dep).toMatchObject({
      updates: expect.arrayContaining([
        expect.objectContaining({
          newValue: expect.stringMatching(/^v0\.1\.\d+$/),
          updateType: 'patch',
        }),
      ]),
    })
  })
})

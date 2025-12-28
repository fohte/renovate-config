import { describe, expect } from 'vitest'
import { createRenovateTest } from './helpers/with-renovate'

const renovateTest = createRenovateTest(['lefthook.yml'])

describe('lefthook customManager', () => {
  renovateTest('should detect lefthook.yml as a package file', ({ ctx }) => {
    const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml')
    expect(lefthookFile.packageFile).toBe('lefthook.yml')
  })

  renovateTest('should extract dependency from lefthook.yml', ({ ctx }) => {
    const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml')
    expect(lefthookFile.deps).toMatchObject([
      {
        depName: 'fohte/lefthook-config',
        currentValue: 'v0.1.0',
        datasource: 'github-tags',
      },
    ])
  })

  renovateTest('should have correct autoReplaceStringTemplate', ({ ctx }) => {
    const lefthookFile = ctx.getPackageFile('regex', 'lefthook.yml')
    expect(lefthookFile.autoReplaceStringTemplate).toBe(
      'ref: {{{newValue}}} # renovate: datasource={{{datasource}}} depName={{{depName}}}'
    )
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { RenovateTestContext } from './helpers/renovate-test-context'

describe('lefthook customManager', () => {
  const ctx = new RenovateTestContext()

  beforeAll(() => {
    ctx.setup(['lefthook.yml'])
  })

  afterAll(() => {
    ctx.cleanup()
  })

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
})

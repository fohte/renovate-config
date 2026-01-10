import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

describeWithRenovate(
  'generic-boilerplate-managed npm packages (node.json5)',
  {
    fixtures: ['generic-boilerplate-managed/package.json'],
    mockNpmPackages: [
      { name: 'prettier', versions: ['3.0.0', '3.1.0'] },
      { name: 'lodash', versions: ['4.17.0', '4.18.0'] },
    ],
    additionalConfigs: ['node.json5'],
  },
  (ctx) => {
    const pkgFile = () =>
      ctx.getPackageFile('npm', 'generic-boilerplate-managed/package.json')

    it('should disable updates for managed packages (prettier)', () => {
      const prettierDep = pkgFile().deps.find((d) => d.depName === 'prettier')

      expect(prettierDep).toMatchObject({
        depName: 'prettier',
        skipReason: 'disabled',
      })
    })

    it('should allow updates for unmanaged packages (lodash)', () => {
      const lodashDep = pkgFile().deps.find((d) => d.depName === 'lodash')

      expect(lodashDep).toMatchObject({
        depName: 'lodash',
        updates: expect.arrayContaining([
          expect.objectContaining({
            newValue: '4.18.0',
          }),
        ]),
      })
    })
  },
)

describeWithRenovate(
  'generic-boilerplate-managed mise tools (base.json5)',
  {
    fixtures: ['generic-boilerplate-managed/.mise.toml'],
    mockGitHubRepos: [
      { name: 'evilmartians/lefthook', tags: ['v2.0.12', 'v2.0.13'] },
      { name: 'rhysd/actionlint', tags: ['v1.7.9', 'v1.7.10'] },
    ],
  },
  (ctx) => {
    const miseFile = () =>
      ctx.getPackageFile('mise', 'generic-boilerplate-managed/.mise.toml')

    it.each(['lefthook', 'actionlint'])(
      'should disable updates for managed tools (%s)',
      (toolName) => {
        const dep = miseFile().deps.find((d) => d.depName === toolName)

        expect(dep).toMatchObject({
          depName: toolName,
          skipReason: 'disabled',
        })
      },
    )

    it('should NOT disable updates for unmanaged tools (go-jsonnet)', () => {
      const goJsonnetDep = miseFile().deps.find(
        (d) => d.depName === 'go-jsonnet',
      )

      expect(goJsonnetDep).toBeDefined()
      expect(goJsonnetDep?.skipReason).not.toBe('disabled')
    })
  },
)

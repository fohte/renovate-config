import { expect, it } from 'vitest'

import { describeWithRenovate } from './helpers/with-renovate'

const WORKFLOW_PATH = '.github/workflows/test.yml'

function workflow(stepsBody: string): string {
  return `name: Test
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
${stepsBody}`
}

interface ExpectedDep {
  currentValue: string
  depName: string
  datasource: string
}

interface Case {
  name: string
  yaml: string
  expected: ExpectedDep[]
}

const MISE_DEP = (currentValue: string): ExpectedDep => ({
  currentValue,
  depName: 'jdx/mise',
  datasource: 'github-releases',
})

const cases: Case[] = [
  {
    name: 'minimal with: version: block',
    yaml: workflow(`      - uses: jdx/mise-action@v2
        with:
          version: 2026.6.6
`),
    expected: [MISE_DEP('2026.6.6')],
  },
  {
    name: 'other keys before version:',
    yaml: workflow(`      - uses: jdx/mise-action@v2
        with:
          experimental: true
          install: true
          version: 2026.6.6
`),
    expected: [MISE_DEP('2026.6.6')],
  },
  {
    name: 'other keys after version:',
    yaml: workflow(`      - uses: jdx/mise-action@v2
        with:
          version: 2026.6.6
          install: true
          cache: true
`),
    expected: [MISE_DEP('2026.6.6')],
  },
  {
    name: 'comment line inside with: block',
    yaml: workflow(`      - uses: jdx/mise-action@v2
        with:
          # pin mise to avoid latest-asset-missing breakage
          version: 2026.6.6
`),
    expected: [MISE_DEP('2026.6.6')],
  },
  {
    name: 'trailing comment on uses:',
    yaml: workflow(`      - uses: jdx/mise-action@v2 # comment
        with:
          version: 2026.6.6
`),
    expected: [MISE_DEP('2026.6.6')],
  },
  {
    name: 'pinned SHA reference for the action',
    yaml: workflow(`      - uses: jdx/mise-action@5083fe46898c414b2475087cc79da59e7da859e8 # v3.5.1
        with:
          version: 2026.6.6
`),
    expected: [MISE_DEP('2026.6.6')],
  },
  {
    name: 'multiple jdx/mise-action steps',
    yaml: workflow(`      - uses: jdx/mise-action@v2
        with:
          version: 2026.6.6
      - uses: jdx/mise-action@v2
        with:
          version: 2026.6.7
`),
    expected: [MISE_DEP('2026.6.6'), MISE_DEP('2026.6.7')],
  },
  {
    name: 'unrelated action with a version: key (must not match)',
    yaml: workflow(`      - uses: actions/setup-node@v4
        with:
          version: 20.0.0
`),
    expected: [],
  },
  {
    name: 'version: outside the with: block (must not match)',
    yaml: workflow(`      - uses: jdx/mise-action@v2
        env:
          version: 9.9.9
        with:
          install: true
`),
    expected: [],
  },
  {
    // Pins the bleed-prevention guard: the continuation pattern must not
    // span the boundary into a sibling step's `with: version:`.
    name: 'jdx/mise-action without version: followed by another step that has version: (must not match)',
    yaml: workflow(`      - uses: jdx/mise-action@v2
        with:
          experimental: true
      - uses: pnpm/action-setup@v2
        with:
          version: 8
`),
    expected: [],
  },
]

for (const { name, yaml, expected } of cases) {
  describeWithRenovate(
    `mise-action customManager: ${name}`,
    {
      fixtures: [],
      inlineFiles: { [WORKFLOW_PATH]: yaml },
    },
    (ctx) => {
      it('produces the expected dep set', () => {
        const deps = ctx.tryGetPackageFile('regex', WORKFLOW_PATH)?.deps ?? []
        const normalized: ExpectedDep[] = deps.map((d) => ({
          currentValue: d.currentValue ?? '',
          depName: d.depName ?? '',
          datasource: d.datasource ?? '',
        }))
        expect(normalized).toEqual(expected)
      })
    },
  )
}

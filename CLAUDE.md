# CLAUDE.md

<<<<<<< before updating
## Preset file responsibilities

When adding a new `packageRule` or manager configuration, decide where to place it based on the **ecosystem** the target depends on.

| File             | Responsibility                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `base.json5`     | Settings common to all projects, **language-agnostic**. Cross-ecosystem rules for `github-actions` / `pre-commit` / `mise` / `copier` / `lockFileMaintenance`, and global defaults (`timezone`, `minimumReleaseAge`, `rangeStrategy`, and so on) |
| `node.json5`     | Rules specific to Node.js (`npm` / `bun`). Packages exclusive to the npm registry such as `@types/*` (DefinitelyTyped) also belong here                                                                                                          |
| `go.json5`       | Rules specific to Go (`gomod`)                                                                                                                                                                                                                   |
| `rust.json5`     | Rules specific to Rust (`cargo`)                                                                                                                                                                                                                 |
| `lefthook.json5` | `customManager` for `lefthook` remotes                                                                                                                                                                                                           |
| `renovate.json5` | Renovate config for this repository itself. Not part of the shared presets                                                                                                                                                                       |

## Placement criterion for `packageRule`

If a rule targets packages distributed **only through a specific language's package manager**, place it in that language's file. `base.json5` should only contain rules that remain harmless when extended by a repository that does not use the language at all.

Examples:

- Automerge for `@types/*` → `node.json5` (npm-only; irrelevant for Go-only repos)
- Automerge for `github-actions` patch updates → `base.json5` (applies to any repo on GitHub)
- Rules for `gomod` → `go.json5`
- Rules for `cargo` → `rust.json5`

When in doubt, ask: "If a Go-only or Rust-only repo extends only `base.json5`, is it acceptable for this rule to be evaluated there?" If not, put it in the language-specific file.
=======
## Test code rules

### Assert on the whole output with a single equality check

Treat each test as a spec: build the expected output as one literal value (object, struct, JSON, array, etc.) and compare it to the actual output with a single equality assertion. Do not split the assertion into per-field checks, and do not use partial matchers (substring contains, `toContain`, `toMatchObject`, prefix/suffix checks, regex-on-substring, etc.). Partial matches silently ignore unexpected fields and extra elements, so the test stops working as a spec the moment the shape of the output changes.

```ts
// bad: picks fields one by one — silent on any new/changed field
const ev = run()
expect(ev.path).toBe('/a')
expect(ev.event).toBe('ok')
expect(ev.message).toContain('done')

// good: one literal, one equality — any drift in shape fails the test
expect(run()).toEqual({
  path: '/a',
  event: 'ok',
  message: 'done',
})
```

For dynamic fields (timestamps, UUIDs, random IDs), normalize them in a helper before the comparison (e.g. replace with a fixed placeholder) so the full output can still be asserted in one equality check. Do not weaken the assertion to dodge the dynamic value.
>>>>>>> after updating

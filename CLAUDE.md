# CLAUDE.md

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

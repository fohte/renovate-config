# CLAUDE.md

## プリセットファイルの責務

新しい packageRule やマネージャー設定を追加する際は、対象が依存する**エコシステム**に基づいて配置先を決めること。

| File             | 責務                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `base.json5`     | 全プロジェクト共通・**言語非依存**の設定。`github-actions` / `pre-commit` / `mise` / `copier` / lockFileMaintenance などエコシステム横断のルール、および全体に効くデフォルト (timezone, minimumReleaseAge, rangeStrategy など) |
| `node.json5`     | Node.js (npm/bun) 専用ルール。`@types/*` (DefinitelyTyped) のような npm レジストリ固有のパッケージもここ                                                                                                                       |
| `go.json5`       | Go (gomod) 専用ルール                                                                                                                                                                                                          |
| `rust.json5`     | Rust (cargo) 専用ルール                                                                                                                                                                                                        |
| `lefthook.json5` | lefthook remotes の customManager                                                                                                                                                                                              |
| `renovate.json5` | このリポジトリ自身の Renovate 設定。共有プリセットには含めない                                                                                                                                                                 |

## packageRule 配置の判断基準

ルールが対象とするパッケージが**特定言語のパッケージマネージャー経由でしか流通しない**なら、その言語のファイルに置く。`base.json5` に置いてよいのは、その言語を一切使わないリポジトリで extend されても無害なルールだけ。

例:

- `@types/*` の automerge → `node.json5` (npm 専用。Go-only リポジトリには無関係)
- `github-actions` の patch automerge → `base.json5` (GitHub 上の任意リポジトリで使う)
- `gomod` のルール → `go.json5`
- `cargo` のルール → `rust.json5`

迷ったら「`base.json5` のみを extend している Go-only / Rust-only リポジトリで、このルールが評価されても問題ないか?」を自問する。問題があるなら言語別ファイルに置く。

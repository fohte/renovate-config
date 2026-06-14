# fohte/renovate-config

@fohte's shared Renovate config

## Usage

### Basic usage

Create a `renovate.json5` file in your repository with the following content:

```json5
{
  $schema: 'https://docs.renovatebot.com/renovate-schema.json',
  extends: ['github>fohte/renovate-config:base.json5'],
}
```

`base.json5` includes a `customManager` that tracks `jdx/mise-action`'s
`with: version:` as a `jdx/mise` release, so a workflow such as

```yaml
- uses: jdx/mise-action@v2
  with:
    version: 2026.6.6
```

is bumped automatically without any per-repository configuration.

### Node.js projects

```json5
{
  $schema: 'https://docs.renovatebot.com/renovate-schema.json',
  extends: [
    'github>fohte/renovate-config:base.json5',
    'github>fohte/renovate-config:node.json5',
  ],
}
```

### Go projects

```json5
{
  $schema: 'https://docs.renovatebot.com/renovate-schema.json',
  extends: [
    'github>fohte/renovate-config:base.json5',
    'github>fohte/renovate-config:go.json5',
  ],
}
```

## Development

### Running tests

```bash
bun run test
```

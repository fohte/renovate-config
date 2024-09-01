# fohte/renovate-config

@fohte's shared Renovate config

## Usage

### Basic usage

Create a `renovate.json5` file in your repository with the following content:

```json5
{
  $schema: 'https://docs.renovatebot.com/renovate-schema.json',
  extends: [
    'github>fohte/renovate-config:base.json5',
  ],
}
```

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

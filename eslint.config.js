import { mainConfig, typescriptConfig } from '@fohte/eslint-config'

const config = [
  ...mainConfig,
  ...typescriptConfig,
  // Ignore CommonJS files (commitlint config)
  {
    ignores: ['**/*.cjs'],
  },
  // This repository doesn't use src/ directory, so relative imports are allowed
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      // Allow unused variables with underscore prefix (intentional omission in destructuring)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]

export default config

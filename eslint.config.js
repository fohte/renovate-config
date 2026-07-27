import { config } from '@fohte/eslint-config'

export default config(
  {
    typescript: { typeChecked: true },
    errorHandling: {},
  },
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
)

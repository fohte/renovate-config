import { config } from '@fohte/eslint-config'

export default config(
  {
    typescript: { typeChecked: true },
    errorHandling: {},
  },
  {
    ignores: ['**/*.cjs'],
  },
  // tests/**/*.ts is not covered by the `#*` subpath import map (src/*.ts only),
  // so relative imports are allowed here.
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

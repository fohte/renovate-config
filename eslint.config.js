import { config } from '@fohte/eslint-config'

<<<<<<< before updating
const config = [
  ...mainConfig,
  ...typescriptConfig,
  // Ignore CommonJS files (commitlint config)
=======
export default config(
  { typescript: { typeChecked: true } },
>>>>>>> after updating
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

import { config } from '@fohte/eslint-config'

export default config(
  {
    ignores: ['**/*.cjs'],
  },
  // This repository doesn't use src/ directory, so relative imports are allowed
  {
    files: ['tests/**/*.ts'],
    typescript: {
      'no-restricted-imports': 'off',
      // Allow unused variables with underscore prefix (intentional omission in destructuring)
<<<<<<< before updating
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ] },
||||||| last update
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message:
                'Please use absolute imports instead of relative imports.',
            },
          ],
        },
      ] },
=======
      typeChecked: true },
>>>>>>> after updating
    errorHandling: {},
  },
)

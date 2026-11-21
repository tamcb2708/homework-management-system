import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'storage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: false } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Only the database module may construct Prisma clients; raw unsafe SQL is forbidden.
      'no-restricted-syntax': ['error',
        { selector: "MemberExpression[property.name='$queryRawUnsafe']", message: 'Use tagged $queryRaw with parameters.' },
        { selector: "MemberExpression[property.name='$executeRawUnsafe']", message: 'Use tagged $executeRaw with parameters.' }],
    },
  },
);

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Architecture boundaries (docs/architecture/01 §2):
 *  - src/modules/** (business logic) must not import concrete providers, Next.js, or the app/server layers.
 *  - src/modules/*\/domain/** is pure: no database either.
 */
const moduleBoundary = {
  patterns: [
    { group: ['@/providers/*', '!@/providers/types', '**/providers/sms/*', '**/providers/kyc/*', '**/providers/registry'], message: 'Business logic must use provider interfaces (src/providers/types.ts), never a concrete adapter.' },
    { group: ['next', 'next/*', 'next-intl', 'next-intl/*'], message: 'Business logic must not depend on Next.js.' },
    { group: ['@/app/*', '@/server/*', '@/ui/*'], message: 'Business logic must not import the app, server or UI layers.' },
  ],
};

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { ignores: ['.next/**', 'node_modules/**', 'db/migrations/**', 'next-env.d.ts'] },
  { files: ['src/modules/**/*.ts'], rules: { 'no-restricted-imports': ['error', moduleBoundary] } },
  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...moduleBoundary.patterns, { group: ['**/db/*', 'drizzle-orm', 'drizzle-orm/*', 'postgres'], message: 'Domain code is pure: no database access.' }] }],
    },
  },
  { files: ['tests/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off', 'import/no-anonymous-default-export': 'off' } },
  { rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] } },
];

export default config;

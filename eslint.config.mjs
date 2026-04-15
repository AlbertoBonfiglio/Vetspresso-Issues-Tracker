// @ts-check

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
    // Global ignores
    {
        ignores: ['out/**', 'dist/**', '**/*.d.ts', 'esbuild.js', 'node_modules/**'],
    },

    // TypeScript source files
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2022,
                sourceType: 'module',
                project: './tsconfig.json',
                tsconfigRootDir: __dirname,
            },
        },
        plugins: {
            '@typescript-eslint': /** @type {any} */ (tsPlugin),
        },
        rules: {
            // ESLint recommended subset safe for TS
            'no-unused-vars': 'off',   // replaced by @typescript-eslint version
            'no-undef': 'off',         // TypeScript handles this

            // @typescript-eslint recommended + type-checked
            ...tsPlugin.configs['recommended'].rules,
            ...tsPlugin.configs['recommended-type-checked'].rules,

            // Project overrides
            '@typescript-eslint/naming-convention': [
                'warn',
                { selector: 'import', format: ['camelCase', 'PascalCase'] },
            ],
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            'curly': 'warn',
            'eqeqeq': ['warn', 'always'],
            'no-throw-literal': 'warn',
            'semi': ['warn', 'always'],
            'quotes': ['warn', 'single'],
            'no-console': 'off',
        },
    },
];

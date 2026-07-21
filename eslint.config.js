import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * The most important rule in this file is the layer boundary.
 *
 *   ui/ and render/  ->  may import engine/, content/, persistence/
 *   engine/          ->  imports none of them. Pure TypeScript, zero deps.
 *   content/         ->  imports nothing from engine/. Data, not code.
 *
 * This purity is not dogma: it is what lets `npm run sim:seasons` simulate
 * dozens of seasons in seconds to check balance, and what makes every rule
 * testable in milliseconds. If React leaks into engine/, that capability dies
 * quietly.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // ---- Boundary: the engine stays pure ------------------------------------
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*', 'zustand', 'zustand/*'],
              message:
                'engine/ is pure TypeScript. No React or UI state here — see src/engine/README.md.',
            },
            {
              group: ['@/ui', '@/ui/*', '@/render', '@/render/*', '**/ui/*', '**/render/*'],
              message:
                'engine/ must not depend on ui/ or render/. Dependencies only point inward.',
            },
          ],
        },
      ],
      // All engine randomness flows through the seeded Rng stored in the save.
      // Math.random() breaks determinism, replays and reproducible tests.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'Use the seeded Rng from engine/rng instead of Math.random(). Determinism is a hard requirement.',
        },
      ],
    },
  },

  // ---- Boundary: content is data, not code --------------------------------
  {
    files: ['src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/engine', '@/engine/*', '@/ui', '@/ui/*', '@/render', '@/render/*'],
              message:
                'content/ holds data and its schemas. Adding content must never require touching the engine.',
            },
          ],
        },
      ],
    },
  },

  // ---- React --------------------------------------------------------------
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'],
    extends: [reactHooks.configs['recommended-latest'], reactRefresh.configs.vite],
  },

  // ---- Tests and scripts --------------------------------------------------
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // ---- Config files -------------------------------------------------------
  {
    files: ['*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
    extends: [tseslint.configs.disableTypeChecked],
  },
);

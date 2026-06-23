import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'scripts/**',
      'tests/**/*.{js,mjs}',
      '**/*.config.js',
    ],
  },

  // 1. TypeScript rules (sets tseslint.parser globally)
  ...tseslint.configs.recommended,

  // 2. Vue rules (overrides parser to vue-eslint-parser for *.vue — must come AFTER tseslint)
  ...pluginVue.configs['flat/essential'],

  // 3. Wire TypeScript parser as the inner <script> parser for .vue files
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
  },

  // 4. Project-wide rule overrides
  {
    files: ['src/**/*.{ts,vue}'],
    rules: {
      // TypeScript
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Allow ternary-as-statement (canvas API feature detection pattern)
      '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
      // Allow const self = this for closure capture
      '@typescript-eslint/no-this-alias': 'off',

      // Vue
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'vue/no-unused-vars': 'warn',

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
]

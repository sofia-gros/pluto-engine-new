import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** 禁止構文 (docs/03-coding-standards.md §8)。設定ファイルでは default export だけを外す。 */
const RESTRICTED_SYNTAX = [
  { selector: 'TSEnumDeclaration', message: 'enum 禁止。as const オブジェクトを使う' },
  { selector: 'TSModuleDeclaration[kind="namespace"]', message: 'namespace 禁止' },
  { selector: 'ExportDefaultDeclaration', message: 'default export 禁止' },
  { selector: 'ForInStatement', message: 'for...in 禁止' },
  { selector: 'PrivateIdentifier', message: '#private 禁止。private 修飾子を使う' },
  {
    selector:
      'VariableDeclarator[id.name=/^[A-Z][a-z]/] > TSAsExpression > ObjectExpression > Property > Identifier.key[name=/^[^A-Z]/]',
    message: 'as const 列挙オブジェクトのキーは PascalCase (docs/03-coding-standards.md §3)',
  },
];

/** Node スクリプト (tools・設定ファイル) で使う組込グローバル。 */
const NODE_GLOBALS = {
  console: 'readonly',
  process: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Buffer: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'bench/results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      noInlineConfig: true,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': true, 'ts-nocheck': true },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'property', format: null },
        {
          selector: 'variable',
          format: null,
          filter: {
            regex: '^__.*__$',
            match: true,
          },
        },
        {
          selector: 'variable',
          types: ['boolean'],
          format: ['PascalCase'],
          prefix: ['is', 'has', 'can', 'should'],
        },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        // default import されるコンストラクタ (`import WorkerCtor from './x?worker&inline'`, 05 §3.2) は PascalCase
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        { selector: 'memberLike', modifiers: ['private'], format: ['camelCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: { regex: '^I[A-Z]', match: false },
        },
        { selector: 'enumMember', format: ['PascalCase'] },
      ],
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
      'max-params': ['error', 6],
      complexity: ['error', 20],
      'no-restricted-globals': ['error', 'event', 'name'],
    },
  },
  {
    // logger と、console をスパイして検証する logger のテストだけが console を使ってよい (docs/03-coding-standards.md §8)
    files: ['src/core/debug/logger.ts', 'tests/unit/core/debug/logger.test.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['tests/**'],
    rules: {
      'max-lines': ['error', { max: 800, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // 設定ファイルは export default が必須なので、その禁止だけを外す
    files: ['*.config.js', '*.config.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...RESTRICTED_SYNTAX.filter((r) => r.selector !== 'ExportDefaultDeclaration'),
      ],
    },
  },
  {
    // JavaScript (tools・設定ファイル) は型情報が無いので型検査系ルールを外す
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: NODE_GLOBALS,
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    // tools は CLI なので console を使う
    files: ['tools/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);

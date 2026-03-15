import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettierConfig from 'eslint-config-prettier'

export default tseslint.config(
  // 対象ファイル
  {
    files: ['src/**/*.{ts,tsx}']
  },
  // 除外ファイル
  {
    ignores: ['out/**', 'dist/**', 'node_modules/**']
  },
  // 基本ルール
  js.configs.recommended,
  // TypeScript ルール
  ...tseslint.configs.recommended,
  // React ルール
  {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    settings: {
      react: { version: 'detect' }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 17+ では不要
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },
  // Prettier との競合ルールを無効化（最後に置く）
  prettierConfig
)

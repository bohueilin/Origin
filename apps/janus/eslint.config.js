import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // '.claude/worktrees' holds nested git worktrees (copies of this repo); linting them trips the
  // TS parser with "multiple candidate TSConfigRootDirs". Never lint build output or nested checkouts.
  globalIgnores(['dist', '.claude']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The Hono server + Cloudflare worker are NOT React. The react-hooks/react-refresh rules
    // (which key off `use*` / component-name heuristics) don't apply — e.g. the credential
    // broker's `useLease(...)` is a plain function, not a hook.
    files: ['server/**/*.ts', 'worker/**/*.ts', 'scripts/**/*.{ts,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])

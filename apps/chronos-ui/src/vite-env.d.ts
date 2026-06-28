/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which backend the UI talks to: 'http' (real static data, default) | 'mock'. */
  readonly VITE_TRACEBACK_API?: 'http' | 'mock'
  /** Base path for the real static API JSON (default '/api'). */
  readonly VITE_TRACEBACK_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

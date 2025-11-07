/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LONGCAT_API_KEY?: string
  readonly VITE_LONGCAT_BASE_URL?: string
  readonly VITE_LONGCAT_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITLAB_CLIENT_ID?: string
  readonly VITE_GITLAB_URL?: string
  readonly VITE_REDIRECT_URI?: string
  readonly VITE_APP_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITLAB_CLIENT_ID?: string
  readonly VITE_GITLAB_INSTANCE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

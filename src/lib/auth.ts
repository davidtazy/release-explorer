import { computed, ref } from 'vue'
import { resetAvatarCache } from '@/lib/avatars'

const TOKEN_KEY = 'gitlab-release-explorer.token'
const INSTANCE_KEY = 'gitlab-release-explorer.instance'

export const DEFAULT_INSTANCE = 'https://gitlab.com'

function readSession(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeSession(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    /* storage can be unavailable (private mode); the token then stays in memory */
  }
}

function writeLocal(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Normalizes `gitlab.com`, `https://gitlab.com/` or `.../api/graphql` to an origin. */
export function normalizeInstanceUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return DEFAULT_INSTANCE

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)
    const path = url.pathname.replace(/\/api\/graphql\/?$/i, '').replace(/\/+$/, '')
    return `${url.protocol}//${url.host}${path}`
  } catch {
    return DEFAULT_INSTANCE
  }
}

export function graphqlEndpoint(instanceUrl: string): string {
  return `${normalizeInstanceUrl(instanceUrl)}/api/graphql`
}

export function instanceHost(instanceUrl: string): string {
  try {
    return new URL(normalizeInstanceUrl(instanceUrl)).host
  } catch {
    return instanceUrl
  }
}

/** Personal access token, kept in `sessionStorage` only (never in the persisted data model). */
export const token = ref(readSession(TOKEN_KEY))
/** GitLab base URL, remembered across sessions but not secret. */
export const instanceUrl = ref(normalizeInstanceUrl(readLocal(INSTANCE_KEY) || DEFAULT_INSTANCE))
export const isConnected = computed(() => token.value.length > 0)

export function connect(url: string, personalAccessToken: string): void {
  resetAvatarCache()
  instanceUrl.value = normalizeInstanceUrl(url)
  token.value = personalAccessToken.trim()
  writeLocal(INSTANCE_KEY, instanceUrl.value)
  writeSession(TOKEN_KEY, token.value)
}

export function disconnect(): void {
  resetAvatarCache()
  token.value = ''
  writeSession(TOKEN_KEY, '')
}

export function rememberInstance(url: string): void {
  instanceUrl.value = normalizeInstanceUrl(url)
  writeLocal(INSTANCE_KEY, instanceUrl.value)
}

import { computed, ref } from 'vue'

const INSTANCE_KEY = 'gitlab-release-explorer.instance'
const ACCESS_KEY = 'gitlab-release-explorer.oauth-access'
const REFRESH_KEY = 'gitlab-release-explorer.oauth-refresh'
const EXPIRES_KEY = 'gitlab-release-explorer.oauth-expires'
const STATE_KEY = 'gitlab-release-explorer.oauth-state'
const VERIFIER_KEY = 'gitlab-release-explorer.oauth-verifier'
const SIGNED_OUT_KEY = 'gitlab-release-explorer.signed-out'
const LEGACY_TOKEN_KEY = 'gitlab-release-explorer.token'

export const DEFAULT_INSTANCE = 'https://gitlab.com'
export const OAUTH_SCOPE = 'read_api'
/** Public OAuth application id (safe to expose in the browser). */
export const clientId = (import.meta.env.VITE_GITLAB_CLIENT_ID ?? '').trim()
export const isOAuthConfigured = clientId.length > 0
const configuredInstance = (import.meta.env.VITE_GITLAB_INSTANCE_URL ?? '').trim()

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

/** Where GitLab sends the browser back after authorization. */
export function callbackUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const path = base.endsWith('/') ? `${base}callback` : `${base}/callback`
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path}`
}

export interface AuthorizeUrlOptions {
  instanceUrl: string
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  scope?: string
}

/** GitLab OAuth authorize URL for the Authorization Code + PKCE flow. */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: options.scope ?? OAUTH_SCOPE,
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: 'S256',
  })

  return `${normalizeInstanceUrl(options.instanceUrl)}/oauth/authorize?${params.toString()}`
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

/** Prefix of the current OAuth access token; the refresh token is kept too. */
const token = ref(readSession(ACCESS_KEY))
const refreshToken = ref(readSession(REFRESH_KEY))
const expiresAt = ref(Number(readSession(EXPIRES_KEY)) || 0)

/** GitLab base URL, remembered across sessions but not secret. */
export const instanceUrl = ref(
  normalizeInstanceUrl(readLocal(INSTANCE_KEY) || configuredInstance || DEFAULT_INSTANCE),
)
export const isConnected = computed(() => token.value.length > 0)

/**
 * Set after an explicit sign-out so the app shows a signed-out screen instead
 * of immediately bouncing back to GitLab. Cleared when the user signs in again.
 */
export const signedOut = ref(readSession(SIGNED_OUT_KEY) === '1')

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function storeTokens(data: TokenResponse): void {
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 7200

  token.value = data.access_token
  refreshToken.value = data.refresh_token ?? ''
  expiresAt.value = Date.now() + expiresIn * 1000

  writeSession(ACCESS_KEY, token.value)
  writeSession(REFRESH_KEY, refreshToken.value)
  writeSession(EXPIRES_KEY, String(expiresAt.value))
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const endpoint = `${normalizeInstanceUrl(instanceUrl.value)}/oauth/token`

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })
  } catch {
    throw new Error(`Could not reach ${endpoint}. Check the instance URL and your network.`)
  }

  let payload: TokenResponse | null = null
  try {
    payload = (await response.json()) as TokenResponse
  } catch {
    payload = null
  }

  if (!response.ok) {
    const detail = payload?.error_description ?? payload?.error ?? `HTTP ${response.status}`
    throw new Error(`GitLab login failed: ${detail}`)
  }

  if (!payload?.access_token) throw new Error('GitLab returned no access token.')

  return payload
}

function rememberInstance(url: string): void {
  instanceUrl.value = normalizeInstanceUrl(url)
  writeLocal(INSTANCE_KEY, instanceUrl.value)
}

/** Start the Authorization Code + PKCE redirect. */
export async function startLogin(url: string): Promise<void> {
  if (!isOAuthConfigured) {
    throw new Error(
      'GitLab OAuth is not configured. Set VITE_GITLAB_CLIENT_ID in .env and restart the dev server.',
    )
  }

  clearSignedOut()

  const target = normalizeInstanceUrl(url)
  rememberInstance(target)

  const verifier = randomString(64)
  const state = randomString(24)
  const challenge = await codeChallenge(verifier)

  writeSession(VERIFIER_KEY, verifier)
  writeSession(STATE_KEY, state)

  window.location.assign(
    buildAuthorizeUrl({
      instanceUrl: target,
      clientId,
      redirectUri: callbackUrl(),
      state,
      codeChallenge: challenge,
    }),
  )
}

/** Exchange the authorization code for tokens (called by the callback view). */
export async function completeLogin(code: string, state: string): Promise<void> {
  const expectedState = readSession(STATE_KEY)
  const verifier = readSession(VERIFIER_KEY)

  writeSession(STATE_KEY, '')
  writeSession(VERIFIER_KEY, '')

  if (!expectedState || !verifier) {
    throw new Error('The login session expired. Start the GitLab connection again.')
  }
  if (state !== expectedState) {
    throw new Error('The OAuth state did not match. Start the GitLab connection again.')
  }

  const data = await requestToken({
    client_id: clientId,
    code,
    grant_type: 'authorization_code',
    redirect_uri: callbackUrl(),
    code_verifier: verifier,
  })

  storeTokens(data)
  clearSignedOut()
}

let refreshPromise: Promise<string> | null = null

function isTokenExpired(): boolean {
  return expiresAt.value > 0 && Date.now() >= expiresAt.value - 60_000
}

/** Current access token, refreshed automatically when it is about to expire. */
export async function getAccessToken(): Promise<string> {
  if (token.value && !isTokenExpired()) return token.value
  if (!refreshToken.value) return token.value
  return refreshAccessToken()
}

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const data = await requestToken({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken.value,
        redirect_uri: callbackUrl(),
      })
      if (signedOut.value) return ''
      storeTokens(data)
      return token.value
    } catch {
      disconnect()
      throw new Error('Your GitLab session expired. Connect again from Preferences.')
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function disconnect(): void {
  token.value = ''
  refreshToken.value = ''
  expiresAt.value = 0

  writeSession(ACCESS_KEY, '')
  writeSession(REFRESH_KEY, '')
  writeSession(EXPIRES_KEY, '')
  writeSession(LEGACY_TOKEN_KEY, '')
}

// Older builds kept a personal access token in this key; it is no longer used.
writeSession(LEGACY_TOKEN_KEY, '')

export function clearSignedOut(): void {
  signedOut.value = false
  writeSession(SIGNED_OUT_KEY, '')
}

/** Best-effort RFC 7009 revocation; the local session is cleared regardless. */
async function revokeToken(value: string): Promise<void> {
  if (!value || !clientId) return

  try {
    await fetch(`${normalizeInstanceUrl(instanceUrl.value)}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, token: value }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    /* revocation is best effort; local cleanup already happened */
  }
}

/**
 * Sign out: revoke the OAuth tokens, clear the local session and remember the
 * explicit sign-out so the app does not immediately redirect to GitLab again.
 */
export async function logout(): Promise<void> {
  const access = token.value
  const refresh = refreshToken.value

  signedOut.value = true
  writeSession(SIGNED_OUT_KEY, '1')

  token.value = ''
  refreshToken.value = ''
  expiresAt.value = 0

  writeSession(ACCESS_KEY, '')
  writeSession(REFRESH_KEY, '')
  writeSession(EXPIRES_KEY, '')
  writeSession(STATE_KEY, '')
  writeSession(VERIFIER_KEY, '')
  writeSession(LEGACY_TOKEN_KEY, '')

  await Promise.allSettled([revokeToken(refresh), revokeToken(access)])
}

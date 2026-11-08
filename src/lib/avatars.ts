/**
 * Group and project avatars are served from authenticated REST endpoints
 * (`GET /api/v4/groups/:id/avatar`), not from the GraphQL `avatarUrl` (that
 * uploads URL requires a session cookie for private entities). We download the
 * bytes with the OAuth access token and expose them as blob URLs.
 */

export type AvatarKind = 'group' | 'project'

// The token passed to `loadAvatar` is an OAuth access token obtained via
// `getAccessToken()`; it is never persisted with the fetched data.

const blobUrls = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

function numericId(globalId: string): string {
  const last = globalId.split('/').pop() ?? ''
  return /^\d+$/.test(last) ? last : ''
}

function key(kind: AvatarKind, instanceUrl: string, globalId: string): string {
  return `${instanceUrl}|${kind}|${globalId}`
}

/** Blob URL already downloaded in this session, or `''`. */
export function cachedAvatar(
  kind: AvatarKind,
  instanceUrl: string,
  globalId: string,
): string {
  return blobUrls.get(key(kind, instanceUrl, globalId)) ?? ''
}

/** Download (once) and return a blob URL, or `''` when there is no avatar. */
export function loadAvatar(
  kind: AvatarKind,
  instanceUrl: string,
  token: string,
  globalId: string,
): Promise<string> {
  const cacheKey = key(kind, instanceUrl, globalId)
  const cached = blobUrls.get(cacheKey)
  if (cached !== undefined) return Promise.resolve(cached)

  const inFlight = pending.get(cacheKey)
  if (inFlight) return inFlight

  const request = fetchAvatar(kind, instanceUrl, token, globalId)
    .catch(() => '')
    .then((url) => {
      blobUrls.set(cacheKey, url)
      pending.delete(cacheKey)
      return url
    })

  pending.set(cacheKey, request)
  return request
}

async function fetchAvatar(
  kind: AvatarKind,
  instanceUrl: string,
  token: string,
  globalId: string,
): Promise<string> {
  const id = numericId(globalId)
  if (!id || !token) return ''

  const base = instanceUrl.replace(/\/+$/, '')
  const response = await fetch(`${base}/api/v4/${kind}s/${id}/avatar`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return ''

  const bytes = await response.arrayBuffer()
  if (bytes.byteLength === 0) return ''

  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
}

/** Release blob URLs, e.g. when the token or the GitLab instance changes. */
export function resetAvatarCache(): void {
  for (const url of blobUrls.values()) {
    if (url) URL.revokeObjectURL(url)
  }
  blobUrls.clear()
  pending.clear()
}

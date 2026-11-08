import { describe, expect, it } from 'vitest'
import {
  buildAuthorizeUrl,
  clearSignedOut,
  logout,
  resolveCallbackUrl,
  signedOut,
} from '@/lib/auth'

const options = {
  instanceUrl: 'https://gitlab.com',
  clientId: 'client-123',
  redirectUri: 'http://localhost:5173/callback',
  state: 'state-1',
  codeChallenge: 'challenge-1',
}

describe('buildAuthorizeUrl', () => {
  it('builds a PKCE authorize URL', () => {
    const url = new URL(buildAuthorizeUrl(options))

    expect(url.origin).toBe('https://gitlab.com')
    expect(url.pathname).toBe('/oauth/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe(options.redirectUri)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('read_api')
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('keeps a self-managed instance subpath', () => {
    const url = new URL(
      buildAuthorizeUrl({ ...options, instanceUrl: 'https://gitlab.example.com/gitlab' }),
    )

    expect(url.pathname).toBe('/gitlab/oauth/authorize')
  })
})

describe('resolveCallbackUrl', () => {
  it('prefers an explicit redirect URI', () => {
    expect(
      resolveCallbackUrl({
        redirectUri: 'https://releases.example.com/oauth/callback',
        baseUrl: '/app/',
        origin: 'https://releases.example.com',
      }),
    ).toBe('https://releases.example.com/oauth/callback')
  })

  it('builds the callback from the origin and base path', () => {
    expect(resolveCallbackUrl({ baseUrl: '/', origin: 'http://localhost:5173' })).toBe(
      'http://localhost:5173/callback',
    )
    expect(resolveCallbackUrl({ baseUrl: '/app/', origin: 'https://example.com' })).toBe(
      'https://example.com/app/callback',
    )
  })

  it('adds a missing trailing slash to the base', () => {
    expect(resolveCallbackUrl({ baseUrl: '/app', origin: 'https://example.com' })).toBe(
      'https://example.com/app/callback',
    )
  })
})

describe('logout', () => {
  it('clears the local session and marks the user signed out', async () => {
    sessionStorage.setItem('gitlab-release-explorer.oauth-access', 'access')
    sessionStorage.setItem('gitlab-release-explorer.oauth-refresh', 'refresh')
    sessionStorage.setItem('gitlab-release-explorer.oauth-expires', '123')

    await logout()

    expect(signedOut.value).toBe(true)
    expect(sessionStorage.getItem('gitlab-release-explorer.oauth-access')).toBeNull()
    expect(sessionStorage.getItem('gitlab-release-explorer.oauth-refresh')).toBeNull()
    expect(sessionStorage.getItem('gitlab-release-explorer.oauth-expires')).toBeNull()
    expect(sessionStorage.getItem('gitlab-release-explorer.signed-out')).toBe('1')

    clearSignedOut()
    expect(signedOut.value).toBe(false)
    expect(sessionStorage.getItem('gitlab-release-explorer.signed-out')).toBeNull()
  })
})

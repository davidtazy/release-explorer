import { describe, expect, it } from 'vitest'
import { buildAuthorizeUrl, callbackUrl } from '@/lib/auth'

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

describe('callbackUrl', () => {
  it('points at the local /callback route', () => {
    expect(callbackUrl()).toBe(`${window.location.origin}/callback`)
  })
})

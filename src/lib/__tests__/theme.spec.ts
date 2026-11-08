import { describe, expect, it } from 'vitest'
import { normalizeThemePreference } from '@/lib/theme'

describe('normalizeThemePreference', () => {
  it('keeps the supported preferences', () => {
    expect(normalizeThemePreference('light')).toBe('light')
    expect(normalizeThemePreference('dark')).toBe('dark')
    expect(normalizeThemePreference('system')).toBe('system')
  })

  it('falls back to system for missing or unknown values', () => {
    expect(normalizeThemePreference(null)).toBe('system')
    expect(normalizeThemePreference(undefined)).toBe('system')
    expect(normalizeThemePreference('blue')).toBe('system')
  })
})

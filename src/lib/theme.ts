import { ref } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'

export interface ThemeOption {
  value: ThemePreference
  label: string
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const STORAGE_KEY = 'gitlab-release-explorer.theme'

/** Coerce any stored value to a supported preference. */
export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function readThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return preference
}

/** Preference chosen by the user; `system` follows the OS setting. */
export const themePreference = ref<ThemePreference>(readThemePreference())

/** Write the resolved theme on `<html data-theme>` where the CSS reads it. */
export function applyTheme(preference: ThemePreference = themePreference.value): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = resolveTheme(preference)
}

export function setThemePreference(preference: ThemePreference): void {
  themePreference.value = normalizeThemePreference(preference)
  try {
    localStorage.setItem(STORAGE_KEY, themePreference.value)
  } catch {
    /* storage unavailable: preference stays in memory */
  }
  applyTheme()
}

applyTheme()

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themePreference.value === 'system') applyTheme('system')
  })
}

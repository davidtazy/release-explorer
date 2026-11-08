import type { ReleaseInfo } from '@/types/gitlab'

export type ReleaseRange = '1d' | '1w' | '1m' | '1y' | 'any'

export interface ReleaseRangeOption {
  value: ReleaseRange
  label: string
}

export const RELEASE_RANGE_OPTIONS: readonly ReleaseRangeOption[] = [
  { value: '1d', label: 'Last 24 hours' },
  { value: '1w', label: 'Last week' },
  { value: '1m', label: 'Last month' },
  { value: '1y', label: 'Last year' },
  { value: 'any', label: 'Any time' },
]

const DAY = 86_400_000
const ONE_YEAR = 365 * DAY

const DAYS_BY_RANGE: Record<Exclude<ReleaseRange, 'any'>, number> = {
  '1d': 1,
  '1w': 7,
  '1m': 30,
  '1y': 365,
}

export function releaseTimestamp(release: ReleaseInfo): number | null {
  const raw = release.releasedAt ?? release.createdAt
  if (!raw) return null

  const timestamp = Date.parse(raw)
  return Number.isNaN(timestamp) ? null : timestamp
}

export function sortReleasesDesc(releases: readonly ReleaseInfo[]): ReleaseInfo[] {
  return [...releases].sort(
    (left, right) => (releaseTimestamp(right) ?? 0) - (releaseTimestamp(left) ?? 0),
  )
}

export interface FilteredReleaseList {
  releases: ReleaseInfo[]
  /**
   * True when the "Any time" filter found nothing in the last year and fell
   * back to the single latest release (when one exists).
   */
  fallbackToLatest: boolean
}

export function filterReleases(
  releases: readonly ReleaseInfo[],
  range: ReleaseRange,
  now: number = Date.now(),
): FilteredReleaseList {
  const sorted = sortReleasesDesc(releases)

  if (range === 'any') {
    const cutoff = now - ONE_YEAR
    const withinLastYear = sorted.filter((release) => {
      const timestamp = releaseTimestamp(release)
      return timestamp !== null && timestamp >= cutoff
    })

    if (withinLastYear.length > 0 || sorted.length === 0) {
      return { releases: withinLastYear, fallbackToLatest: false }
    }

    return { releases: sorted.slice(0, 1), fallbackToLatest: true }
  }

  const cutoff = now - DAYS_BY_RANGE[range] * DAY
  const filtered = sorted.filter((release) => {
    const timestamp = releaseTimestamp(release)
    return timestamp !== null && timestamp >= cutoff
  })

  return { releases: filtered, fallbackToLatest: false }
}

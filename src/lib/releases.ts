import type { ReleaseInfo } from '@/types/gitlab'

export type ReleaseRange = '1d' | '1w' | '1m' | '1y'

export interface ReleaseRangeOption {
  value: ReleaseRange
  label: string
}

export const RELEASE_RANGE_OPTIONS: readonly ReleaseRangeOption[] = [
  { value: '1d', label: 'Last 24 hours' },
  { value: '1w', label: 'Last week' },
  { value: '1m', label: 'Last month' },
  { value: '1y', label: 'Last year' },
]

const DAY = 86_400_000

const DAYS_BY_RANGE: Record<ReleaseRange, number> = {
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

/** Oldest instant that belongs to a range: `Date.now() - range length`. */
export function releaseRangeCutoff(range: ReleaseRange, now: number = Date.now()): number {
  return now - DAYS_BY_RANGE[range] * DAY
}

/** Merge two pages of releases, newest first, without duplicate tags. */
export function mergeReleases(
  existing: readonly ReleaseInfo[],
  incoming: readonly ReleaseInfo[],
): ReleaseInfo[] {
  const byTag = new Map<string, ReleaseInfo>()
  for (const release of existing) byTag.set(release.tagName, release)
  for (const release of incoming) byTag.set(release.tagName, release)
  return sortReleasesDesc([...byTag.values()])
}

export function sortReleasesDesc(releases: readonly ReleaseInfo[]): ReleaseInfo[] {
  return [...releases].sort(
    (left, right) => (releaseTimestamp(right) ?? 0) - (releaseTimestamp(left) ?? 0),
  )
}

/** Releases inside the selected period, newest first. */
export function filterReleases(
  releases: readonly ReleaseInfo[],
  range: ReleaseRange,
  now: number = Date.now(),
): ReleaseInfo[] {
  const cutoff = releaseRangeCutoff(range, now)
  return sortReleasesDesc(releases).filter((release) => {
    const timestamp = releaseTimestamp(release)
    return timestamp !== null && timestamp >= cutoff
  })
}

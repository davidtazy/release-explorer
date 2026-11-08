import { describe, expect, it } from 'vitest'
import type { ReleaseInfo } from '@/types/gitlab'
import {
  filterReleases,
  mergeReleases,
  releaseRangeCutoff,
  releaseTimestamp,
  sortReleasesDesc,
} from '@/lib/releases'

const NOW = Date.parse('2026-06-15T12:00:00Z')
const DAY = 86_400_000

function release(tagName: string, daysAgo: number | null, createdAt?: string): ReleaseInfo {
  return {
    tagName,
    name: null,
    releasedAt: daysAgo === null ? null : new Date(NOW - daysAgo * DAY).toISOString(),
    createdAt: createdAt ?? new Date(NOW - 400 * DAY).toISOString(),
  }
}

describe('releaseTimestamp', () => {
  it('prefers releasedAt and falls back to createdAt', () => {
    expect(releaseTimestamp(release('v1', 2))).toBe(NOW - 2 * DAY)
    expect(releaseTimestamp(release('v2', null))).toBe(NOW - 400 * DAY)
  })

  it('returns null for unparsable dates', () => {
    expect(releaseTimestamp({ ...release('v1', 1), releasedAt: 'not-a-date' })).toBeNull()
  })
})

describe('sortReleasesDesc', () => {
  it('sorts newest first without mutating the input', () => {
    const input = [release('old', 20), release('new', 1), release('middle', 10)]
    const sorted = sortReleasesDesc(input)

    expect(sorted.map((item) => item.tagName)).toEqual(['new', 'middle', 'old'])
    expect(input.map((item) => item.tagName)).toEqual(['old', 'new', 'middle'])
  })
})

describe('releaseRangeCutoff', () => {
  it('returns the start of each range', () => {
    expect(releaseRangeCutoff('1d', NOW)).toBe(NOW - DAY)
    expect(releaseRangeCutoff('1w', NOW)).toBe(NOW - 7 * DAY)
    expect(releaseRangeCutoff('1m', NOW)).toBe(NOW - 30 * DAY)
    expect(releaseRangeCutoff('1y', NOW)).toBe(NOW - 365 * DAY)
    expect(releaseRangeCutoff('any', NOW)).toBe(NOW - 365 * DAY)
  })
})

describe('mergeReleases', () => {
  it('merges pages by tag, newest first, without duplicates', () => {
    const firstPage = [release('v3', 1), release('v2', 10)]
    const secondPage = [release('v2', 10), release('v1', 100)]

    const merged = mergeReleases(firstPage, secondPage)

    expect(merged.map((item) => item.tagName)).toEqual(['v3', 'v2', 'v1'])
    expect(firstPage.map((item) => item.tagName)).toEqual(['v3', 'v2'])
  })
})

describe('filterReleases', () => {
  it('keeps only releases from the last 24 hours', () => {
    const result = filterReleases(
      [release('today', 0.5), release('yesterday', 2)],
      '1d',
      NOW,
    )

    expect(result.releases.map((item) => item.tagName)).toEqual(['today'])
    expect(result.fallbackToLatest).toBe(false)
  })

  it.each([
    ['1w', 6, 8],
    ['1m', 20, 40],
    ['1y', 300, 400],
  ] as const)('filters with %s', (range, included, excluded) => {
    const result = filterReleases(
      [release('in', included), release('out', excluded)],
      range,
      NOW,
    )

    expect(result.releases.map((item) => item.tagName)).toEqual(['in'])
  })

  it('"any" keeps releases from the last 12 months', () => {
    const result = filterReleases(
      [release('recent', 30), release('a-bit-old', 300), release('ancient', 500)],
      'any',
      NOW,
    )

    expect(result.releases.map((item) => item.tagName)).toEqual(['recent', 'a-bit-old'])
    expect(result.fallbackToLatest).toBe(false)
  })

  it('"any" falls back to the single latest release when the last year is empty', () => {
    const result = filterReleases(
      [release('newest', 500), release('older', 900)],
      'any',
      NOW,
    )

    expect(result.releases.map((item) => item.tagName)).toEqual(['newest'])
    expect(result.fallbackToLatest).toBe(true)
  })

  it('"any" stays empty when the project has no releases', () => {
    const result = filterReleases([], 'any', NOW)

    expect(result.releases).toEqual([])
    expect(result.fallbackToLatest).toBe(false)
  })
})

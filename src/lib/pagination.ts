/** Page sizes offered under the tables. */
export const PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 20

const STORAGE_KEY = 'gitlab-release-explorer.page-size'

/** Page size chosen by the user, shared by every table in the app. */
export function readPageSize(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY))
    if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(stored)) return stored
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PAGE_SIZE
}

export function writePageSize(size: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(size))
  } catch {
    /* storage unavailable */
  }
}

export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
}

/** Items of one page, clamped to the available range. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): T[] {
  const size = Math.max(1, pageSize)
  const start = (Math.max(1, page) - 1) * size
  return items.slice(start, start + size)
}

export type PagerItem = number | 'gap'

/** Page numbers to render, with gaps around the current page when there are many. */
export function pagerItemsFor(current: number, total: number): PagerItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)

  const page = Math.min(Math.max(current, 1), total)
  const items: PagerItem[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(total - 1, page + 1)

  if (start > 2) items.push('gap')
  for (let number = start; number <= end; number += 1) items.push(number)
  if (end < total - 1) items.push('gap')
  items.push(total)

  return items
}

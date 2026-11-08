const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function toDate(value: string | number): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = toDate(value)
  return date ? dateFormatter.format(date) : '—'
}

export function formatDateTime(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = toDate(value)
  return date ? dateTimeFormatter.format(date) : '—'
}

/** "just now", "3 hours ago", "2 days ago"… */
export function formatRelativeTime(value: number | null | undefined): string {
  if (!value) return 'never'
  return relativeFrom(value)
}

/** Relative label for any date string/timestamp, or `''` when it is missing. */
export function formatTimeAgo(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const date = toDate(value)
  return date ? relativeFrom(date.getTime()) : ''
}

function relativeFrom(timestamp: number): string {
  const diff = timestamp - Date.now()
  const absolute = Math.abs(diff)

  if (absolute < MINUTE) return 'just now'
  if (absolute < HOUR) return relativeFormatter.format(Math.round(diff / MINUTE), 'minute')
  if (absolute < DAY) return relativeFormatter.format(Math.round(diff / HOUR), 'hour')
  if (absolute < 30 * DAY) return relativeFormatter.format(Math.round(diff / DAY), 'day')
  if (absolute < 365 * DAY) {
    return relativeFormatter.format(Math.round(diff / (30 * DAY)), 'month')
  }
  return relativeFormatter.format(Math.round(diff / (365 * DAY)), 'year')
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

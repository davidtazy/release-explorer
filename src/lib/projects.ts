import type { GroupInfo, ProjectReleaseSummary } from '@/types/gitlab'
import { releaseTimestamp } from '@/lib/releases'

/** How the main view orders groups and the projects inside them. */
export type ProjectSort = 'name' | 'date'

export const PROJECT_SORT_OPTIONS: readonly { value: ProjectSort; label: string }[] = [
  { value: 'name', label: 'Name (A→Z)' },
  { value: 'date', label: 'Release date' },
]

/** Projects that share the same immediate parent group. */
export interface ProjectGroup {
  /** GraphQL global id of the parent group (used to fetch its avatar). */
  id: string
  /** Full path of the parent group. */
  path: string
  /** Human-readable group name. */
  name: string
  projects: ProjectReleaseSummary[]
}

/** Full path of the group a project belongs to (its path without the project name). */
export function projectGroupPath(projectPath: string): string {
  const index = projectPath.lastIndexOf('/')
  return index > 0 ? projectPath.slice(0, index) : ''
}

function fallbackName(path: string): string {
  const leaf = path.split('/').filter(Boolean).pop()
  return leaf ?? 'Projects'
}

function latestTimestamp(project: ProjectReleaseSummary): number | null {
  return project.latestRelease ? releaseTimestamp(project.latestRelease) : null
}

/** Newest first, projects without a dated release last. */
function compareByDateDesc(
  left: number | null,
  right: number | null,
  leftName: string,
  rightName: string,
): number {
  if (left === right) return leftName.localeCompare(rightName)
  if (left === null) return 1
  if (right === null) return -1
  return right - left
}

function sortProjects(projects: ProjectReleaseSummary[], sort: ProjectSort): ProjectReleaseSummary[] {
  return [...projects].sort((left, right) => {
    if (sort === 'date') {
      const compared = compareByDateDesc(
        latestTimestamp(left),
        latestTimestamp(right),
        left.name,
        right.name,
      )
      if (compared !== 0) return compared
    }
    return left.name.localeCompare(right.name)
  })
}

/**
 * Split a flat project list into one bucket per immediate parent group.
 *
 * Names are resolved from the accessible groups when available and fall back to
 * the last path segment. Groups and projects are sorted by name (A→Z) or by
 * their newest release date (newest first, undated entries last).
 */
export function groupProjectsByParent(
  projects: readonly ProjectReleaseSummary[],
  groups: readonly GroupInfo[],
  sort: ProjectSort = 'name',
): ProjectGroup[] {
  const groupsByPath = new Map(groups.map((group) => [group.fullPath, group]))
  const buckets = new Map<string, ProjectReleaseSummary[]>()

  for (const project of projects) {
    const path = projectGroupPath(project.fullPath)
    const bucket = buckets.get(path)
    if (bucket) bucket.push(project)
    else buckets.set(path, [project])
  }

  const result = [...buckets.entries()].map(([path, groupProjects]) => ({
    id: groupsByPath.get(path)?.id ?? '',
    path,
    name: groupsByPath.get(path)?.name ?? fallbackName(path),
    projects: sortProjects(groupProjects, sort),
  }))

  return result.sort((left, right) => {
    if (sort === 'date') {
      const leftDate = Math.max(
        ...left.projects.map((project) => latestTimestamp(project) ?? Number.NEGATIVE_INFINITY),
      )
      const rightDate = Math.max(
        ...right.projects.map((project) => latestTimestamp(project) ?? Number.NEGATIVE_INFINITY),
      )
      const compared = compareByDateDesc(
        Number.isFinite(leftDate) ? leftDate : null,
        Number.isFinite(rightDate) ? rightDate : null,
        left.name,
        right.name,
      )
      if (compared !== 0) return compared
    }
    return left.name.localeCompare(right.name) || left.path.localeCompare(right.path)
  })
}

/** Parent group paths that directly contain at least one project. */
export function groupPathsWithProjects(
  snapshots: Record<string, { projects: readonly ProjectReleaseSummary[] }>,
): string[] {
  const paths = new Set<string>()
  for (const snapshot of Object.values(snapshots)) {
    for (const project of snapshot.projects) paths.add(projectGroupPath(project.fullPath))
  }
  return [...paths].sort()
}

/** Drop the projects of groups whose `visible` flag is off. */
export function filterInvisibleProjects(
  projects: readonly ProjectReleaseSummary[],
  groups: readonly GroupInfo[],
): ProjectReleaseSummary[] {
  if (groups.length === 0) return [...projects]

  const visibleByPath = new Map(groups.map((group) => [group.fullPath, group.visible]))
  return projects.filter(
    (project) => visibleByPath.get(projectGroupPath(project.fullPath)) !== false,
  )
}

import type { GroupInfo, ProjectReleaseSummary } from '@/types/gitlab'

/** Projects that share the same immediate parent group. */
export interface ProjectGroup {
  /** Full path of the parent group. */
  path: string
  /** Human-readable group name. */
  name: string
  projects: ProjectReleaseSummary[]
}

function parentPathOf(projectPath: string): string {
  const index = projectPath.lastIndexOf('/')
  return index > 0 ? projectPath.slice(0, index) : ''
}

function fallbackName(path: string): string {
  const leaf = path.split('/').filter(Boolean).pop()
  return leaf ?? 'Projects'
}

/**
 * Split a flat project list into one bucket per immediate parent group.
 *
 * Names are resolved from the accessible groups when available and fall back to
 * the last path segment. Groups are ordered by full path (so parent pages read
 * top-down) and projects keep a stable name order inside each group.
 */
export function groupProjectsByParent(
  projects: readonly ProjectReleaseSummary[],
  groups: readonly GroupInfo[],
): ProjectGroup[] {
  const groupsByPath = new Map(groups.map((group) => [group.fullPath, group]))
  const buckets = new Map<string, ProjectReleaseSummary[]>()

  for (const project of projects) {
    const path = parentPathOf(project.fullPath)
    const bucket = buckets.get(path)
    if (bucket) bucket.push(project)
    else buckets.set(path, [project])
  }

  return [...buckets.entries()]
    .map(([path, groupProjects]) => ({
      path,
      name: groupsByPath.get(path)?.name ?? fallbackName(path),
      projects: [...groupProjects].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
}

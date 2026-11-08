/**
 * Data model for the GitLab release explorer.
 *
 * Everything here is read-only data fetched through the GitLab GraphQL API.
 * The persisted model (`PersistedState`) is stored in `localStorage` and is
 * timestamped so the UI can tell when it becomes stale.
 */

export interface GitLabUser {
  id: string
  username: string
  name: string
}

export interface GroupInfo {
  id: string
  name: string
  fullPath: string
  webUrl: string
  /** Full path of the parent group, or `null` for a root group. */
  parentPath: string | null
  /**
   * Whether the group's own projects appear in the main view. Hiding a group
   * only hides its direct projects; its subgroups keep their own flag.
   */
  visible: boolean
}

export interface ReleaseInfo {
  tagName: string
  name: string | null
  releasedAt: string | null
  createdAt: string | null
}

export interface ProjectReleaseSummary {
  id: string
  name: string
  fullPath: string
  webUrl: string
  /** Most recent release, or `null` when the project has no releases. */
  latestRelease: ReleaseInfo | null
}

/** Result of one GraphQL query for a selected group (including subgroups). */
export interface GroupSnapshot {
  groupPath: string
  fetchedAt: number
  projects: ProjectReleaseSummary[]
}

/** Detailed release list for one project, fetched when opening the detail view. */
export interface ProjectDetailCache {
  id: string
  projectPath: string
  fetchedAt: number
  name: string
  webUrl: string
  releases: ReleaseInfo[]
}

export interface PersistedState {
  version: typeof STATE_VERSION
  instanceUrl: string
  user: GitLabUser | null
  groups: GroupInfo[]
  groupsFetchedAt: number | null
  selectedPaths: string[]
  snapshots: Record<string, GroupSnapshot>
  details: Record<string, ProjectDetailCache>
}

export const STATE_VERSION = 1 as const

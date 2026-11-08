import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  fetchGroupSnapshot,
  fetchGroups,
  fetchProjectDetails,
  type GitLabContext,
} from '@/api/gitlab'
import { instanceUrl, isConnected } from '@/lib/auth'
import { filterInvisibleProjects, groupPathsWithProjects } from '@/lib/projects'
import { releaseTimestamp } from '@/lib/releases'
import {
  STATE_VERSION,
  type GitLabUser,
  type GroupInfo,
  type GroupSnapshot,
  type PersistedState,
  type ProjectDetailCache,
  type ProjectReleaseSummary,
} from '@/types/gitlab'

export const STORAGE_KEY = 'gitlab-release-explorer.state'
/** Cached data older than one hour is refreshed automatically. */
export const STALE_AFTER_MS = 60 * 60 * 1000

function isStale(timestamp: number | null): boolean {
  return timestamp === null || Date.now() - timestamp > STALE_AFTER_MS
}

function readPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<PersistedState> & { hiddenPaths?: unknown }
    if (parsed.version !== STATE_VERSION) return null
    if (typeof parsed.instanceUrl !== 'string' || parsed.instanceUrl !== instanceUrl.value) return null

    // Older versions stored a flat hiddenPaths list; fold it into group.visible.
    const legacyHidden = new Set(
      Array.isArray(parsed.hiddenPaths) ? (parsed.hiddenPaths as string[]) : [],
    )

    return {
      version: STATE_VERSION,
      instanceUrl: parsed.instanceUrl,
      user: parsed.user ? { ...parsed.user, avatarUrl: parsed.user.avatarUrl ?? '' } : null,
      groups: Array.isArray(parsed.groups)
        ? parsed.groups.map((group) => ({
            ...group,
            visible: group.visible !== false && !legacyHidden.has(group.fullPath),
          }))
        : [],
      groupsFetchedAt: typeof parsed.groupsFetchedAt === 'number' ? parsed.groupsFetchedAt : null,
      selectedPaths: Array.isArray(parsed.selectedPaths) ? parsed.selectedPaths : [],
      snapshots:
        parsed.snapshots && typeof parsed.snapshots === 'object'
          ? (parsed.snapshots as Record<string, GroupSnapshot>)
          : {},
      details:
        parsed.details && typeof parsed.details === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.details as Record<string, ProjectDetailCache>).map(
                ([path, detail]) => [
                  path,
                  {
                    ...detail,
                    id: detail.id ?? '',
                    releases: Array.isArray(detail.releases) ? detail.releases : [],
                  },
                ],
              ),
            )
          : {},
    }
  } catch {
    return null
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred while talking to GitLab.'
}

export const useReleasesStore = defineStore('releases', () => {
  const user = ref<GitLabUser | null>(null)
  const groups = ref<GroupInfo[]>([])
  const groupsFetchedAt = ref<number | null>(null)
  const selectedPaths = ref<string[]>([])
  const snapshots = ref<Record<string, GroupSnapshot>>({})
  const details = ref<Record<string, ProjectDetailCache>>({})

  const loadingGroups = ref(false)
  const loadingSnapshots = ref<string[]>([])
  const loadingDetails = ref<string[]>([])
  const error = ref<string | null>(null)

  // ---------------------------------------------------------------- hydration

  const persisted = readPersisted()
  if (persisted) {
    user.value = persisted.user
    groups.value = persisted.groups
    groupsFetchedAt.value = persisted.groupsFetchedAt
    snapshots.value = persisted.snapshots
    details.value = persisted.details

    const knownGroupPaths = new Set(persisted.groups.map((group) => group.fullPath))
    selectedPaths.value = persisted.selectedPaths.filter((path) => knownGroupPaths.has(path))
  }

  function buildPayload(): PersistedState {
    return {
      version: STATE_VERSION,
      instanceUrl: instanceUrl.value,
      user: user.value,
      groups: groups.value,
      groupsFetchedAt: groupsFetchedAt.value,
      selectedPaths: selectedPaths.value,
      snapshots: snapshots.value,
      details: details.value,
    }
  }

  function persist(): void {
    const payload = buildPayload()
    const isEmpty =
      payload.user === null &&
      payload.groups.length === 0 &&
      payload.groupsFetchedAt === null &&
      payload.selectedPaths.length === 0 &&
      Object.keys(payload.snapshots).length === 0 &&
      Object.keys(payload.details).length === 0

    try {
      if (isEmpty) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* quota exceeded or storage disabled: keep working in memory */
    }
  }

  // Persist the data model (but never the token) whenever it changes.
  watch([user, groups, groupsFetchedAt, selectedPaths, snapshots, details], persist, {
    deep: true,
  })

  // ------------------------------------------------------------- derived data

  const selectedGroups = computed<GroupInfo[]>(() => {
    const byPath = new Map(groups.value.map((group) => [group.fullPath, group]))
    return selectedPaths.value
      .map((path) => byPath.get(path))
      .filter((group): group is GroupInfo => group !== undefined)
  })

  /** Union of the projects covered by the selected groups (subgroups included). */
  const projects = computed<ProjectReleaseSummary[]>(() => {
    const byPath = new Map<string, ProjectReleaseSummary>()

    for (const path of selectedPaths.value) {
      const snapshot = snapshots.value[path]
      if (!snapshot) continue
      for (const project of snapshot.projects) byPath.set(project.fullPath, project)
    }

    return filterInvisibleProjects([...byPath.values()], groups.value).sort((left, right) =>
      left.name.localeCompare(right.name),
    )
  })

  const loading = computed(() => loadingGroups.value || loadingSnapshots.value.length > 0)

  /** Parent groups that directly contain at least one cached project. */
  const groupsWithProjects = computed<string[]>(() => groupPathsWithProjects(snapshots.value))

  const lastRefresh = computed<number | null>(() => {
    const timestamps = [
      groupsFetchedAt.value,
      ...Object.values(snapshots.value).map((snapshot) => snapshot.fetchedAt),
      ...Object.values(details.value).map((detail) => detail.fetchedAt),
    ].filter((value): value is number => typeof value === 'number')

    return timestamps.length > 0 ? Math.max(...timestamps) : null
  })

  const storageSummary = computed(() => {
    const snapshotList = Object.values(snapshots.value)
    const uniqueProjects = new Map<string, ProjectReleaseSummary>()

    for (const snapshot of snapshotList) {
      for (const project of snapshot.projects) uniqueProjects.set(project.fullPath, project)
    }

    const detailList = Object.values(details.value)
    const detailedReleases = detailList.reduce((total, detail) => total + detail.releases.length, 0)
    const latestReleases = [...uniqueProjects.values()].filter(
      (project) => project.latestRelease !== null,
    ).length

    const releaseDates = [
      ...[...uniqueProjects.values()].map((project) =>
        project.latestRelease ? releaseTimestamp(project.latestRelease) : null,
      ),
      ...detailList.flatMap((detail) =>
        detail.releases.map((release) => releaseTimestamp(release)),
      ),
    ].filter((value): value is number => value !== null)

    const capturedAt = [
      groupsFetchedAt.value,
      ...snapshotList.map((snapshot) => snapshot.fetchedAt),
      ...detailList.map((detail) => detail.fetchedAt),
    ].filter((value): value is number => typeof value === 'number')

    const isEmpty = snapshotList.length === 0 && groups.value.length === 0 && capturedAt.length === 0

    let bytes = 0
    if (!isEmpty) {
      try {
        bytes = new TextEncoder().encode(JSON.stringify(buildPayload())).length
      } catch {
        bytes = 0
      }
    }

    return {
      accessibleGroups: groups.value.length,
      cachedGroups: snapshotList.length,
      projects: uniqueProjects.size,
      releases: latestReleases + detailedReleases,
      detailedReleases,
      oldestRelease: releaseDates.length > 0 ? Math.min(...releaseDates) : null,
      newestRelease: releaseDates.length > 0 ? Math.max(...releaseDates) : null,
      firstCapture: capturedAt.length > 0 ? Math.min(...capturedAt) : null,
      lastRefresh: capturedAt.length > 0 ? Math.max(...capturedAt) : null,
      bytes,
      isEmpty,
    }
  })

  // ------------------------------------------------------------------ actions

  function context(): GitLabContext {
    return { instanceUrl: instanceUrl.value }
  }

  function dismissError(): void {
    error.value = null
  }

  async function ensureGroups(force = false): Promise<void> {
    if (!isConnected.value || loadingGroups.value) return
    if (!force && !isStale(groupsFetchedAt.value)) return

    loadingGroups.value = true
    error.value = null

    try {
      const result = await fetchGroups(context())
      const previousVisibility = new Map(groups.value.map((group) => [group.fullPath, group.visible]))

      user.value = result.user
      groups.value = result.groups.map((group) => ({
        ...group,
        visible: previousVisibility.get(group.fullPath) ?? group.visible,
      }))
      groupsFetchedAt.value = Date.now()

      const knownGroupPaths = new Set(result.groups.map((group) => group.fullPath))
      selectedPaths.value = selectedPaths.value.filter((path) => knownGroupPaths.has(path))
    } catch (caught) {
      error.value = describeError(caught)
    } finally {
      loadingGroups.value = false
    }
  }

  async function ensureSnapshot(path: string, force = false): Promise<void> {
    if (!isConnected.value) return
    if (loadingSnapshots.value.includes(path)) return

    const existing = snapshots.value[path]
    if (!force && existing && !isStale(existing.fetchedAt)) return

    loadingSnapshots.value = [...loadingSnapshots.value, path]
    error.value = null

    try {
      const projectsOfGroup = await fetchGroupSnapshot(context(), path)
      snapshots.value = {
        ...snapshots.value,
        [path]: { groupPath: path, fetchedAt: Date.now(), projects: projectsOfGroup },
      }
    } catch (caught) {
      error.value = describeError(caught)
    } finally {
      loadingSnapshots.value = loadingSnapshots.value.filter((item) => item !== path)
    }
  }

  async function ensureSelectedSnapshots(force = false): Promise<void> {
    if (!isConnected.value) return
    await Promise.all(selectedPaths.value.map((path) => ensureSnapshot(path, force)))
  }

  async function refreshAll(): Promise<void> {
    if (!isConnected.value) {
      error.value = 'Connect a GitLab account first.'
      return
    }

    await ensureGroups(true)
    await ensureSelectedSnapshots(true)
  }

  async function ensureDetail(projectPath: string, force = false): Promise<void> {
    if (!projectPath || !isConnected.value) return
    if (loadingDetails.value.includes(projectPath)) return

    const existing = details.value[projectPath]
    if (!force && existing && !isStale(existing.fetchedAt)) return

    loadingDetails.value = [...loadingDetails.value, projectPath]
    error.value = null

    try {
      const detail = await fetchProjectDetails(context(), projectPath)
      details.value = { ...details.value, [projectPath]: detail }
    } catch (caught) {
      error.value = describeError(caught)
    } finally {
      loadingDetails.value = loadingDetails.value.filter((item) => item !== projectPath)
    }
  }

  /** Show/hide a group's own projects. Subgroups keep their own flag. */
  function setGroupVisibility(path: string, visible: boolean): void {
    groups.value = groups.value.map((group) =>
      group.fullPath === path ? { ...group, visible } : group,
    )
  }

  /** Unselect the group's own projects without affecting its subgroups. */
  function hideGroup(path: string): void {
    setGroupVisibility(path, false)
  }

  /** Flip the view flag without touching which groups are selected/fetched. */
  function toggleGroupVisibility(path: string): void {
    const group = groups.value.find((item) => item.fullPath === path)
    if (group) setGroupVisibility(path, !group.visible)
  }

  function toggleGroup(path: string, checked: boolean): void {
    if (checked) {
      const prefix = `${path}/`
      selectedPaths.value = [
        ...selectedPaths.value.filter((item) => item !== path && !item.startsWith(prefix)),
        path,
      ].sort()
      void ensureSnapshot(path)
    } else {
      selectedPaths.value = selectedPaths.value.filter((item) => item !== path)
    }
  }

  function findProject(projectPath: string): ProjectReleaseSummary | undefined {
    return projects.value.find((project) => project.fullPath === projectPath)
  }

  function clearData(): void {
    user.value = null
    groups.value = []
    groupsFetchedAt.value = null
    selectedPaths.value = []
    snapshots.value = {}
    details.value = {}
    error.value = null

    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  return {
    // state
    user,
    groups,
    groupsFetchedAt,
    selectedPaths,
    snapshots,
    details,
    loadingGroups,
    loadingSnapshots,
    loadingDetails,
    error,
    // derived
    selectedGroups,
    projects,
    groupsWithProjects,
    loading,
    lastRefresh,
    storageSummary,
    // actions
    dismissError,
    ensureGroups,
    ensureSnapshot,
    ensureSelectedSnapshots,
    ensureDetail,
    refreshAll,
    toggleGroup,
    hideGroup,
    toggleGroupVisibility,
    findProject,
    clearData,
  }
})

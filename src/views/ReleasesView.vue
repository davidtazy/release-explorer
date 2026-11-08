<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useReleasesStore } from '@/stores/releases'
import { isConnected } from '@/lib/auth'
import EntityAvatar from '@/components/EntityAvatar.vue'
import { formatDate, formatRelativeTime, formatTimeAgo } from '@/lib/format'
import {
  PROJECT_SORT_OPTIONS,
  groupProjectsByParent,
  type ProjectSort,
} from '@/lib/projects'

const store = useReleasesStore()
const router = useRouter()

const sortMode = ref<ProjectSort>('name')
const hasSelection = computed(() => store.selectedPaths.length > 0)
const projectGroups = computed(() =>
  groupProjectsByParent(store.projects, store.groups, sortMode.value),
)
const withRelease = computed(
  () => store.projects.filter((project) => project.latestRelease !== null).length,
)
const waitingForSnapshots = computed(
  () =>
    store.loadingSnapshots.length > 0 ||
    store.selectedPaths.some((path) => !store.snapshots[path]),
)
const failedToLoad = computed(() => store.projects.length === 0 && store.error !== null)

function openProject(path: string): void {
  void router.push({ name: 'project', query: { path } })
}
</script>

<template>
  <section class="view">
    <header class="view-header">
      <div>
        <h1>Releases</h1>
        <p class="muted view-subtitle">
          Latest release per project for the groups selected in Preferences.
        </p>
      </div>
      <div class="view-actions">
        <span v-if="store.lastRefresh" class="muted">
          Updated {{ formatRelativeTime(store.lastRefresh) }}
        </span>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!isConnected || store.loading"
          @click="store.refreshAll()"
        >
          {{ store.loading ? 'Refreshing groups & releases…' : 'Refresh groups & releases' }}
        </button>
      </div>
    </header>

    <div v-if="!isConnected && store.groups.length === 0" class="panel empty-state">
      <h2>Connect to GitLab</h2>
      <p>
        Add a personal access token in <strong>Preferences</strong> to load the groups you can
        access.
      </p>
      <RouterLink class="btn btn-primary empty-action" :to="{ name: 'preferences' }">
        Open Preferences
      </RouterLink>
    </div>

    <div v-else-if="!hasSelection" class="panel empty-state">
      <h2>Select a group</h2>
      <p>
        Pick one or more groups (or a parent group) in <strong>Preferences</strong>. Their projects
        and latest releases will appear here.
      </p>
      <RouterLink class="btn btn-primary empty-action" :to="{ name: 'preferences' }">
        Choose groups
      </RouterLink>
    </div>

    <div v-else class="group-cards">
      <div class="view-toolbar">
        <span class="muted">
          <strong>{{ projectGroups.length }}</strong> groups ·
          <strong>{{ store.projects.length }}</strong> projects ·
          <strong>{{ withRelease }}</strong> with a release
        </span>
        <div class="view-controls">
          <span v-if="waitingForSnapshots" class="muted">Loading releases…</span>
          <label class="sort-control">
            <span class="field-label">Sort</span>
            <select v-model="sortMode" aria-label="Sort groups and projects">
              <option
                v-for="option in PROJECT_SORT_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div v-if="failedToLoad" class="panel empty-state">
        <h2>Could not load projects</h2>
        <p>Could not load the selected groups. See the error above.</p>
      </div>
      <div v-else-if="store.projects.length === 0 && waitingForSnapshots" class="panel empty-state">
        <h2>Loading</h2>
        <p>Loading releases for the selected groups…</p>
      </div>
      <div v-else-if="store.projects.length === 0" class="panel empty-state">
        <h2>No projects</h2>
        <p>No projects found in the selected groups.</p>
      </div>

      <template v-else>
        <section
          v-for="group in projectGroups"
          :key="group.path"
          class="panel group-card"
          :aria-label="group.name"
        >
          <header class="group-card-header">
            <div class="group-card-identity">
              <EntityAvatar kind="group" :global-id="group.id" :name="group.name" size="md" />
              <div class="group-card-heading">
                <h2 class="group-card-title">{{ group.name }}</h2>
                <span class="group-card-path">{{ group.path }}</span>
              </div>
            </div>
            <div class="group-card-actions">
              <span class="count">{{ group.projects.length }}</span>
              <button
                type="button"
                class="icon-btn"
                :aria-label="`Hide ${group.name} from the main view`"
                :title="`Hide ${group.name} — use the eye icon in Preferences to show it again`"
                @click="store.hideGroup(group.path)"
              >
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                >
                  <circle cx="8" cy="8" r="5.6" />
                  <path d="M5.4 8h5.2" />
                </svg>
              </button>
            </div>
          </header>

          <div class="table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Latest release</th>
                  <th scope="col">Released</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="project in group.projects"
                  :key="project.fullPath"
                  class="clickable-row"
                  @click="openProject(project.fullPath)"
                >
                  <td>
                    <div class="project-cell">
                      <EntityAvatar
                        kind="project"
                        :global-id="project.id"
                        :name="project.name"
                        size="sm"
                      />
                      <div class="project-cell-body">
                        <RouterLink
                          class="project-link"
                          :to="{ name: 'project', query: { path: project.fullPath } }"
                          :title="project.fullPath"
                          @click.stop
                        >
                          {{ project.name }}
                        </RouterLink>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span v-if="project.latestRelease" class="version-chip">
                      {{ project.latestRelease.tagName }}
                    </span>
                    <span v-else class="muted">No release</span>
                  </td>
                  <td
                    class="nowrap"
                    :title="formatTimeAgo(project.latestRelease?.releasedAt)"
                  >
                    {{ formatDate(project.latestRelease?.releasedAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </section>
</template>

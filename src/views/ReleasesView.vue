<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useReleasesStore } from '@/stores/releases'
import { isConnected } from '@/lib/auth'
import { formatDate, formatRelativeTime } from '@/lib/format'
import { groupProjectsByParent } from '@/lib/projects'

const store = useReleasesStore()
const router = useRouter()

const hasSelection = computed(() => store.selectedPaths.length > 0)
const projectGroups = computed(() => groupProjectsByParent(store.projects, store.groups))
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
        <h1>Project releases</h1>
        <p class="muted view-subtitle">
          Latest release per project for the groups selected in the sidebar.
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
          {{ store.loading ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div v-if="!isConnected && store.groups.length === 0" class="panel empty-state">
      <h2>Connect to GitLab</h2>
      <p>
        Add a personal access token in the <strong>Connection</strong> panel to load the groups you
        can access.
      </p>
    </div>

    <div v-else-if="!hasSelection" class="panel empty-state">
      <h2>Select a group</h2>
      <p>
        Pick one or more groups (or a parent group) in the tree on the left. Their projects and
        latest releases will appear here.
      </p>
    </div>

    <div v-else class="group-cards">
      <div class="group-summary">
        <span class="muted">
          <strong>{{ projectGroups.length }}</strong> groups ·
          <strong>{{ store.projects.length }}</strong> projects ·
          <strong>{{ withRelease }}</strong> with a release
        </span>
        <span v-if="waitingForSnapshots" class="muted">Loading releases…</span>
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
            <div class="group-card-heading">
              <h2 class="group-card-title">{{ group.name }}</h2>
              <span class="group-card-path">{{ group.path }}</span>
            </div>
            <span class="count">{{ group.projects.length }}</span>
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
                    <RouterLink
                      class="project-link"
                      :to="{ name: 'project', query: { path: project.fullPath } }"
                      @click.stop
                    >
                      {{ project.name }}
                    </RouterLink>
                    <span class="project-path">{{ project.fullPath }}</span>
                  </td>
                  <td>
                    <span v-if="project.latestRelease" class="version-chip">
                      {{ project.latestRelease.tagName }}
                    </span>
                    <span v-else class="muted">No release</span>
                  </td>
                  <td class="nowrap">{{ formatDate(project.latestRelease?.releasedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>
  </section>
</template>

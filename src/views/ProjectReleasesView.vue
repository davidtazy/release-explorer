<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { RELEASES_PER_PROJECT } from '@/api/gitlab'
import EntityAvatar from '@/components/EntityAvatar.vue'
import { isConnected } from '@/lib/auth'
import { formatDateTime, formatRelativeTime } from '@/lib/format'
import { RELEASE_RANGE_OPTIONS, filterReleases, type ReleaseRange } from '@/lib/releases'
import { useReleasesStore } from '@/stores/releases'

const route = useRoute()
const store = useReleasesStore()

const projectPath = computed(() => (typeof route.query.path === 'string' ? route.query.path : ''))
const range = ref<ReleaseRange>('any')

const detail = computed(() => store.details[projectPath.value])
const summary = computed(() => store.findProject(projectPath.value))
const projectName = computed(
  () => detail.value?.name ?? summary.value?.name ?? projectPath.value,
)
const projectWebUrl = computed(() => detail.value?.webUrl || summary.value?.webUrl || '')
const projectGlobalId = computed(() => detail.value?.id || summary.value?.id || '')
const loading = computed(() => store.loadingDetails.includes(projectPath.value))
const filtered = computed(() => filterReleases(detail.value?.releases ?? [], range.value))
const fetchedCount = computed(() => detail.value?.releases.length ?? 0)

let refreshTimer: ReturnType<typeof setInterval> | undefined

function refresh(): void {
  void store.ensureDetail(projectPath.value, true)
}

function onRangeChange(event: Event): void {
  range.value = (event.target as HTMLSelectElement).value as ReleaseRange
}

function releaseHref(tagName: string): string {
  return projectWebUrl.value
    ? `${projectWebUrl.value}/-/releases/${encodeURIComponent(tagName)}`
    : ''
}

onMounted(() => {
  void store.ensureDetail(projectPath.value)
  refreshTimer = setInterval(() => {
    void store.ensureDetail(projectPath.value)
  }, 60_000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})

watch(projectPath, (path) => {
  if (path) void store.ensureDetail(path)
})
</script>

<template>
  <section class="view">
    <div v-if="!projectPath" class="panel empty-state">
      <h2>No project selected</h2>
      <p><RouterLink :to="{ name: 'releases' }">← Back to all projects</RouterLink></p>
    </div>

    <template v-else>
      <header class="view-header">
        <div class="detail-heading">
          <RouterLink class="back-link" :to="{ name: 'releases' }">← All projects</RouterLink>
          <div class="detail-title">
            <EntityAvatar kind="project" :global-id="projectGlobalId" :name="projectName" size="md" />
            <h1>{{ projectName }}</h1>
          </div>
          <p class="muted detail-subtitle">
            <span class="mono">{{ projectPath }}</span>
            <a
              v-if="projectWebUrl"
              class="link"
              :href="projectWebUrl"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open in GitLab ↗
            </a>
          </p>
        </div>
        <div class="view-actions">
          <span v-if="detail" class="muted">
            Updated {{ formatRelativeTime(detail.fetchedAt) }}
          </span>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!isConnected || loading"
            @click="refresh"
          >
            {{ loading ? 'Refreshing release history…' : 'Refresh release history' }}
          </button>
        </div>
      </header>

      <div class="panel">
        <div class="filter-bar">
          <label class="field field-inline">
            <span class="field-label">Released within</span>
            <select :value="range" @change="onRangeChange">
              <option v-for="option in RELEASE_RANGE_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <p class="muted filter-note">
            Fetched the {{ fetchedCount }} most recent release{{ fetchedCount === 1 ? '' : 's' }}
            (max {{ RELEASES_PER_PROJECT }}).
          </p>
        </div>

        <p v-if="filtered.fallbackToLatest" class="notice">
          No releases in the last 12 months — showing the latest release only.
        </p>

        <p v-if="loading && !detail" class="muted table-empty">Loading releases…</p>
        <p v-else-if="!detail && !isConnected" class="muted table-empty">
          Connect to GitLab in <RouterLink :to="{ name: 'preferences' }">Preferences</RouterLink> to
          load the release history.
        </p>
        <p v-else-if="!detail" class="muted table-empty">
          Release history is not available. See the error above.
        </p>
        <p v-else-if="filtered.releases.length === 0" class="muted table-empty">
          {{ range === 'any' ? 'This project has no releases.' : 'No releases in this period.' }}
        </p>

        <div v-else class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">Version</th>
                <th scope="col">Release</th>
                <th scope="col">Released</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="release in filtered.releases" :key="release.tagName">
                <td>
                  <a
                    v-if="releaseHref(release.tagName)"
                    class="version-chip"
                    :href="releaseHref(release.tagName)"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {{ release.tagName }}
                  </a>
                  <span v-else class="version-chip">{{ release.tagName }}</span>
                </td>
                <td>{{ release.name || '—' }}</td>
                <td class="nowrap">{{ formatDateTime(release.releasedAt ?? release.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>

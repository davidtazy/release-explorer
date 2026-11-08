<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import EntityAvatar from '@/components/EntityAvatar.vue'
import { isConnected } from '@/lib/auth'
import { formatDate, formatDateTime, formatRelativeTime, formatTimeAgo } from '@/lib/format'
import {
  PAGE_SIZE_OPTIONS,
  pageCountFor,
  paginate,
  pagerItemsFor,
  readPageSize,
  writePageSize,
} from '@/lib/pagination'
import {
  RELEASE_RANGE_OPTIONS,
  filterReleases,
  releaseTimestamp,
  type ReleaseRange,
} from '@/lib/releases'
import { useReleasesStore } from '@/stores/releases'

const route = useRoute()
const store = useReleasesStore()

const projectPath = computed(() => (typeof route.query.path === 'string' ? route.query.path : ''))
const range = ref<ReleaseRange>('1m')
const page = ref(1)
const pageSize = ref(readPageSize())

const detail = computed(() => store.details[projectPath.value])
const summary = computed(() => store.findProject(projectPath.value))
const projectName = computed(
  () => detail.value?.name ?? summary.value?.name ?? projectPath.value,
)
const projectWebUrl = computed(() => detail.value?.webUrl || summary.value?.webUrl || '')
const projectGlobalId = computed(() => detail.value?.id || summary.value?.id || '')
const loading = computed(() => store.loadingDetails.includes(projectPath.value))
const filtered = computed(() => filterReleases(detail.value?.releases ?? [], range.value))
const oldestFiltered = computed(() => {
  const releases = filtered.value
  return releases.length > 0 ? releaseTimestamp(releases[releases.length - 1]!) : null
})
const pages = computed(() => pageCountFor(filtered.value.length, pageSize.value))
const pagerItems = computed(() => pagerItemsFor(page.value, pages.value))
const pageReleases = computed(() => paginate(filtered.value, page.value, pageSize.value))
const rangeStart = computed(() =>
  filtered.value.length === 0 ? 0 : (page.value - 1) * pageSize.value + 1,
)
const rangeEnd = computed(() => Math.min(page.value * pageSize.value, filtered.value.length))

let refreshTimer: ReturnType<typeof setInterval> | undefined

function refresh(): void {
  void store.ensureDetail(projectPath.value, true)
}

function onRangeChange(event: Event): void {
  range.value = (event.target as HTMLSelectElement).value as ReleaseRange
}

function onPageSizeChange(event: Event): void {
  const size = Number((event.target as HTMLSelectElement).value)
  pageSize.value = size
  writePageSize(size)
}

function goToPage(target: number | 'gap'): void {
  if (typeof target !== 'number') return
  page.value = Math.min(Math.max(target, 1), pages.value)
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

watch([range, pageSize], () => {
  page.value = 1
})

watch(projectPath, (path) => {
  page.value = 1
  if (path) void store.ensureDetail(path)
})

watch(pages, (count) => {
  if (page.value > count) page.value = count
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

      <div class="view-toolbar">
        <span class="muted">
          <template v-if="detail">
            <strong>{{ filtered.length }}</strong>
            release{{ filtered.length === 1 ? '' : 's' }}
            <template v-if="oldestFiltered !== null">
              · <span :title="formatTimeAgo(oldestFiltered)">oldest {{ formatDate(oldestFiltered) }}</span>
            </template>
          </template>
          <template v-else>Loading releases…</template>
        </span>
        <div class="view-controls">
          <label class="sort-control">
            <span class="field-label">Released within</span>
            <select :value="range" aria-label="Filter by release period" @change="onRangeChange">
              <option
                v-for="option in RELEASE_RANGE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div class="panel">
        <p v-if="loading && !detail" class="muted table-empty">Loading releases…</p>
        <p v-else-if="!detail && !isConnected" class="muted table-empty">
          Connect to GitLab in <RouterLink :to="{ name: 'preferences' }">Preferences</RouterLink> to
          load the release history.
        </p>
        <p v-else-if="!detail" class="muted table-empty">
          Release history is not available. See the error above.
        </p>
        <p v-else-if="filtered.length === 0" class="muted table-empty">
          No releases in this period.
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
              <tr v-for="release in pageReleases" :key="release.tagName">
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
                <td
                  class="nowrap"
                  :title="formatTimeAgo(release.releasedAt ?? release.createdAt)"
                >
                  {{ formatDateTime(release.releasedAt ?? release.createdAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="filtered.length > 0" class="pagination">
          <label class="page-size">
            <span class="field-label">Rows per page</span>
            <select :value="pageSize" aria-label="Rows per page" @change="onPageSizeChange">
              <option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size">
                {{ size }}
              </option>
            </select>
          </label>

          <div class="pager">
            <span class="muted pager-range">
              {{ rangeStart }}–{{ rangeEnd }} of {{ filtered.length }}
            </span>
            <button
              type="button"
              class="page-btn"
              :disabled="page <= 1"
              aria-label="Previous page"
              @click="goToPage(page - 1)"
            >
              ‹
            </button>
            <template v-for="(item, index) in pagerItems" :key="`${item}-${index}`">
              <span v-if="item === 'gap'" class="page-gap" aria-hidden="true">…</span>
              <button
                v-else
                type="button"
                class="page-btn"
                :class="{ 'is-current': item === page }"
                :aria-current="item === page ? 'page' : undefined"
                @click="goToPage(item)"
              >
                {{ item }}
              </button>
            </template>
            <button
              type="button"
              class="page-btn"
              :disabled="page >= pages"
              aria-label="Next page"
              @click="goToPage(page + 1)"
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

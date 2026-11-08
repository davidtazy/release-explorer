<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useReleasesStore } from '@/stores/releases'
import { formatBytes, formatDate, formatDateTime, formatRelativeTime } from '@/lib/format'

const store = useReleasesStore()
const summary = computed(() => store.storageSummary)
const confirming = ref(false)

let resetTimer: ReturnType<typeof setTimeout> | undefined

function requestClear(): void {
  if (!confirming.value) {
    confirming.value = true
    resetTimer = setTimeout(() => {
      confirming.value = false
    }, 5000)
    return
  }

  if (resetTimer) clearTimeout(resetTimer)
  confirming.value = false
  store.clearData()
}

onUnmounted(() => {
  if (resetTimer) clearTimeout(resetTimer)
})
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <h2>Cached data</h2>
      <span class="count">{{ formatBytes(summary.bytes) }}</span>
    </div>

    <p v-if="summary.isEmpty" class="muted storage-empty">Nothing cached in this browser yet.</p>

    <dl v-else class="summary-list">
      <div class="summary-row">
        <dt>Groups</dt>
        <dd>
          {{ summary.cachedGroups }} cached
          <span v-if="summary.accessibleGroups" class="muted">
            of {{ summary.accessibleGroups }} accessible
          </span>
        </dd>
      </div>
      <div class="summary-row">
        <dt>Projects</dt>
        <dd>{{ summary.projects }}</dd>
      </div>
      <div class="summary-row">
        <dt>Releases</dt>
        <dd>
          {{ summary.releases }}
          <span v-if="summary.detailedReleases" class="muted">
            ({{ summary.detailedReleases }} detailed)
          </span>
        </dd>
      </div>
      <div class="summary-row">
        <dt>Release dates</dt>
        <dd>
          {{ formatDate(summary.oldestRelease) }} → {{ formatDate(summary.newestRelease) }}
        </dd>
      </div>
      <div class="summary-row">
        <dt>Captured</dt>
        <dd>{{ formatDateTime(summary.firstCapture) }}</dd>
      </div>
      <div class="summary-row">
        <dt>Last refresh</dt>
        <dd>{{ formatRelativeTime(summary.lastRefresh) }}</dd>
      </div>
    </dl>

    <button
      type="button"
      class="btn btn-danger btn-sm clear-button"
      :disabled="summary.isEmpty"
      @click="requestClear"
    >
      {{ confirming ? 'Click again to confirm' : 'Clear cached data' }}
    </button>
    <p class="hint">
      Deletes the persisted snapshot from this browser. The GitLab connection stays active.
    </p>
  </section>
</template>

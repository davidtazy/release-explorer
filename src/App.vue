<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { instanceHost, isConnected, instanceUrl } from '@/lib/auth'
import { formatRelativeTime } from '@/lib/format'
import { useReleasesStore } from '@/stores/releases'

const store = useReleasesStore()

let autoRefreshTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  // Refresh stale data on load, then re-check every minute. The store only
  // refetches when a timestamp is older than one hour.
  void store.ensureGroups()
  void store.ensureSelectedSnapshots()

  autoRefreshTimer = setInterval(() => {
    if (!isConnected.value || store.error) return
    void store.ensureGroups()
    void store.ensureSelectedSnapshots()
  }, 60_000)
})

onUnmounted(() => {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">
        <span class="brand-mark" aria-hidden="true">◆</span>
        <span class="brand-text">
          <strong>Release Explorer</strong>
          <small>GitLab · read-only</small>
        </span>
      </RouterLink>

      <div class="header-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!isConnected || store.loading"
          @click="store.refreshAll()"
        >
          {{ store.loading ? 'Refreshing…' : 'Refresh' }}
        </button>

        <span v-if="store.lastRefresh" class="updated muted">
          Updated {{ formatRelativeTime(store.lastRefresh) }}
        </span>

        <RouterLink
          to="/preferences"
          class="connection-pill"
          :class="{ 'is-offline': !isConnected }"
          title="Open preferences"
        >
          <span v-if="isConnected" class="status-dot" />
          {{ isConnected ? (store.user ? `@${store.user.username}` : instanceHost(instanceUrl)) : 'Not connected' }}
        </RouterLink>
      </div>
    </header>

    <div v-if="store.error" class="error-banner" role="alert">
      <span>{{ store.error }}</span>
      <button type="button" class="btn btn-ghost btn-sm" @click="store.dismissError()">
        Dismiss
      </button>
    </div>

    <div class="app-body">
      <main class="main">
        <RouterView />
      </main>
    </div>
  </div>
</template>

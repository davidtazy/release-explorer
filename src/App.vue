<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import ConnectionPanel from '@/components/ConnectionPanel.vue'
import GroupTree from '@/components/GroupTree.vue'
import StoragePanel from '@/components/StoragePanel.vue'
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
        <span v-if="isConnected" class="connection-pill">
          <span class="status-dot" />
          {{ store.user ? `@${store.user.username}` : instanceHost(instanceUrl) }}
        </span>
        <span v-else class="connection-pill muted">Not connected</span>

        <span v-if="store.lastRefresh" class="updated muted">
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

    <div v-if="store.error" class="error-banner" role="alert">
      <span>{{ store.error }}</span>
      <button type="button" class="btn btn-ghost btn-sm" @click="store.dismissError()">
        Dismiss
      </button>
    </div>

    <div class="app-body">
      <aside class="sidebar">
        <ConnectionPanel />

        <section class="panel">
          <div class="panel-heading">
            <h2>Your groups</h2>
            <span class="count">{{ store.groups.length }}</span>
          </div>
          <GroupTree
            :groups="store.groups"
            :selected-paths="store.selectedPaths"
            :busy-paths="store.loadingSnapshots"
            :loading="store.loadingGroups"
            :connected="isConnected"
            @toggle="store.toggleGroup"
          />
          <p v-if="isConnected && store.groups.length > 0" class="hint">
            Selecting a parent group includes all of its subgroups.
          </p>
        </section>

        <StoragePanel />
      </aside>

      <main class="main">
        <RouterView />
      </main>
    </div>
  </div>
</template>

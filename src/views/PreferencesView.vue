<script setup lang="ts">
import { RouterLink } from 'vue-router'
import ConnectionPanel from '@/components/ConnectionPanel.vue'
import GroupTree from '@/components/GroupTree.vue'
import StoragePanel from '@/components/StoragePanel.vue'
import { isConnected } from '@/lib/auth'
import { useReleasesStore } from '@/stores/releases'

const store = useReleasesStore()
</script>

<template>
  <section class="view">
    <header class="view-header">
      <div class="detail-heading">
        <RouterLink class="back-link" :to="{ name: 'releases' }">← All projects</RouterLink>
        <h1>Preferences</h1>
        <p class="muted view-subtitle">Connection, groups, and cached data for this browser.</p>
      </div>
    </header>

    <div class="preferences-grid">
      <ConnectionPanel />

      <section class="panel">
        <div class="panel-heading">
          <h2>Your groups</h2>
          <span class="count">{{ store.groups.length }}</span>
        </div>
        <GroupTree
          :groups="store.groups"
          :selected-paths="store.selectedPaths"
          :groups-with-projects="store.groupsWithProjects"
          :busy-paths="store.loadingSnapshots"
          :loading="store.loadingGroups"
          :connected="isConnected"
          @toggle="store.toggleGroup"
          @toggle-visibility="store.toggleGroupVisibility"
        />
        <p v-if="isConnected && store.groups.length > 0" class="hint">
          Tick a group to load it (a parent includes its subgroups). The eye icon shows or hides a
          group's own projects in the main view; subgroups keep their own setting.
        </p>
      </section>

      <StoragePanel />
    </div>
  </section>
</template>

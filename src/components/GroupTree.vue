<script setup lang="ts">
import { computed } from 'vue'
import { buildGroupTree } from '@/lib/tree'
import type { GroupInfo } from '@/types/gitlab'
import GroupTreeNode from './GroupTreeNode.vue'

const props = defineProps<{
  groups: GroupInfo[]
  selectedPaths: string[]
  busyPaths: string[]
  loading: boolean
  connected: boolean
}>()

const emit = defineEmits<{
  toggle: [path: string, checked: boolean]
}>()

const tree = computed(() => buildGroupTree(props.groups))

function forwardToggle(path: string, checked: boolean): void {
  emit('toggle', path, checked)
}
</script>

<template>
  <div class="tree-wrap">
    <p v-if="groups.length === 0 && !connected" class="muted tree-empty">
      Connect to GitLab to load your groups.
    </p>
    <p v-else-if="groups.length === 0 && loading" class="muted tree-empty">
      Loading your groups…
    </p>
    <p v-else-if="groups.length === 0" class="muted tree-empty">
      No accessible groups were found for this token.
    </p>
    <ul v-else class="tree">
      <GroupTreeNode
        v-for="node in tree"
        :key="node.fullPath"
        :node="node"
        :selected-paths="selectedPaths"
        :depth="0"
        :busy-paths="busyPaths"
        @toggle="forwardToggle"
      />
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { hasSelectedAncestor, type GroupTreeNode as GroupTreeNodeData } from '@/lib/tree'

const props = defineProps<{
  node: GroupTreeNodeData
  selectedPaths: string[]
  depth: number
  busyPaths: string[]
}>()

const emit = defineEmits<{
  toggle: [path: string, checked: boolean]
}>()

const expanded = ref(props.depth < 1)
const hasChildren = computed(() => props.node.children.length > 0)
const coveredByAncestor = computed(() =>
  hasSelectedAncestor(props.node.fullPath, props.selectedPaths),
)
const checked = computed(
  () => coveredByAncestor.value || props.selectedPaths.includes(props.node.fullPath),
)
const busy = computed(() => props.busyPaths.includes(props.node.fullPath))

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement
  emit('toggle', props.node.fullPath, input.checked)
}

function forwardToggle(path: string, nextChecked: boolean): void {
  emit('toggle', path, nextChecked)
}
</script>

<template>
  <li class="tree-node">
    <div class="tree-row">
      <button
        v-if="hasChildren"
        type="button"
        class="twisty"
        :aria-label="expanded ? `Collapse ${node.name}` : `Expand ${node.name}`"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <span class="chevron" :class="{ open: expanded }">▸</span>
      </button>
      <span v-else class="twisty spacer" aria-hidden="true" />

      <label class="tree-label">
        <input
          type="checkbox"
          :checked="checked"
          :disabled="coveredByAncestor"
          @change="onChange"
        />
        <span class="tree-name" :title="node.fullPath">{{ node.name }}</span>
      </label>

      <span v-if="busy" class="busy-dot" title="Loading releases…" aria-label="Loading releases" />
    </div>

    <ul v-if="hasChildren && expanded" class="tree-children">
      <GroupTreeNode
        v-for="child in node.children"
        :key="child.fullPath"
        :node="child"
        :selected-paths="selectedPaths"
        :depth="depth + 1"
        :busy-paths="busyPaths"
        @toggle="forwardToggle"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { hasSelectedAncestor, type GroupTreeNode as GroupTreeNodeData } from '@/lib/tree'
import EntityAvatar from '@/components/EntityAvatar.vue'

const props = defineProps<{
  node: GroupTreeNodeData
  selectedPaths: string[]
  groupsWithProjects: string[]
  depth: number
  busyPaths: string[]
}>()

const emit = defineEmits<{
  toggle: [path: string, checked: boolean]
  toggleVisibility: [path: string]
}>()

const expanded = ref(props.depth < 1)
const hasChildren = computed(() => props.node.children.length > 0)
const coveredByAncestor = computed(() =>
  hasSelectedAncestor(props.node.fullPath, props.selectedPaths),
)
const hidden = computed(() => !props.node.visible)
const checked = computed(
  () => coveredByAncestor.value || props.selectedPaths.includes(props.node.fullPath),
)
// The visibility flag only matters for groups that directly contain projects.
const hasProjects = computed(() => props.groupsWithProjects.includes(props.node.fullPath))
const busy = computed(() => props.busyPaths.includes(props.node.fullPath))

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement
  emit('toggle', props.node.fullPath, input.checked)
}

function forwardToggle(path: string, nextChecked: boolean): void {
  emit('toggle', path, nextChecked)
}

function onToggleVisibility(): void {
  emit('toggleVisibility', props.node.fullPath)
}

function forwardToggleVisibility(path: string): void {
  emit('toggleVisibility', path)
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

      <EntityAvatar kind="group" :global-id="node.id" :name="node.name" size="xs" />

      <label class="tree-label">
        <input
          type="checkbox"
          :checked="checked"
          :disabled="coveredByAncestor"
          @change="onChange"
        />
        <span class="tree-name" :class="{ 'is-hidden': hidden }" :title="node.fullPath">
          {{ node.name }}
        </span>
      </label>

      <button
        v-if="hasProjects"
        type="button"
        class="visibility-btn"
        :class="{ 'is-hidden': hidden }"
        :aria-label="hidden ? `Show ${node.name} in the main view` : `Hide ${node.name} in the main view`"
        :title="
          hidden
            ? `Hidden in the main view — click to show ${node.name}`
            : `Visible in the main view — click to hide ${node.name}`
        "
        @click="onToggleVisibility"
      >
        <svg
          viewBox="0 0 16 16"
          width="14"
          height="14"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8Z" />
          <circle cx="8" cy="8" r="2" />
          <path v-if="hidden" d="M2.5 2.5l11 11" />
        </svg>
      </button>

      <span v-if="busy" class="busy-dot" title="Loading releases…" aria-label="Loading releases" />
    </div>

    <ul v-if="hasChildren && expanded" class="tree-children">
      <GroupTreeNode
        v-for="child in node.children"
        :key="child.fullPath"
        :node="child"
        :selected-paths="selectedPaths"
        :groups-with-projects="groupsWithProjects"
        :depth="depth + 1"
        :busy-paths="busyPaths"
        @toggle="forwardToggle"
        @toggle-visibility="forwardToggleVisibility"
      />
    </ul>
  </li>
</template>

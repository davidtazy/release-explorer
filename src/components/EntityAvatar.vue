<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { instanceUrl, token } from '@/lib/auth'
import { cachedAvatar, loadAvatar, type AvatarKind } from '@/lib/avatars'

const props = withDefaults(
  defineProps<{
    kind: AvatarKind
    globalId: string
    name: string
    size?: 'xs' | 'sm' | 'md'
  }>(),
  { size: 'sm' },
)

const src = ref('')
const initial = computed(() => (props.name.trim().charAt(0) || '?').toUpperCase())

async function refresh(): Promise<void> {
  const kind = props.kind
  const globalId = props.globalId

  src.value = cachedAvatar(kind, instanceUrl.value, globalId)
  if (!globalId || !token.value) return

  const url = await loadAvatar(kind, instanceUrl.value, token.value, globalId)
  if (globalId === props.globalId) src.value = url
}

watch(
  () => [props.kind, props.globalId, instanceUrl.value, token.value] as const,
  () => {
    void refresh()
  },
  { immediate: true },
)
</script>

<template>
  <img
    v-if="src"
    class="entity-avatar"
    :class="`is-${size}`"
    :src="src"
    alt=""
    loading="lazy"
  />
  <span
    v-else
    class="entity-avatar entity-avatar-fallback"
    :class="`is-${size}`"
    aria-hidden="true"
  >
    {{ initial }}
  </span>
</template>

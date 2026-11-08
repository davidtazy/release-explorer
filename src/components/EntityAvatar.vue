<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getAccessToken, instanceUrl } from '@/lib/auth'
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
  if (!globalId) return

  const accessToken = await getAccessToken()
  if (!accessToken) return

  const url = await loadAvatar(kind, instanceUrl.value, accessToken, globalId)
  if (globalId === props.globalId) src.value = url
}

watch(
  () => [props.kind, props.globalId, instanceUrl.value] as const,
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

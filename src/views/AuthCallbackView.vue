<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { completeLogin } from '@/lib/auth'
import { useReleasesStore } from '@/stores/releases'

const route = useRoute()
const router = useRouter()
const store = useReleasesStore()

const working = ref(true)
const error = ref<string | null>(null)

function queryValue(key: string): string {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

onMounted(async () => {
  const oauthError = queryValue('error')
  if (oauthError) {
    error.value = queryValue('error_description') || oauthError
    working.value = false
    return
  }

  const code = queryValue('code')
  const state = queryValue('state')
  if (!code || !state) {
    error.value = 'GitLab did not return an authorization code. Start the connection again.'
    working.value = false
    return
  }

  try {
    await completeLogin(code, state)
    await store.refreshAll()
    await router.replace({ name: 'preferences' })
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : 'Could not complete the GitLab sign-in.'
    working.value = false
  }
})
</script>

<template>
  <section class="view">
    <header class="view-header">
      <div>
        <h1>GitLab sign-in</h1>
        <p class="muted view-subtitle">Finishing the authorization with GitLab.</p>
      </div>
    </header>

    <div class="panel empty-state">
      <template v-if="working">
        <h2>Connecting…</h2>
        <p>Exchanging the authorization code and loading your groups.</p>
      </template>
      <template v-else>
        <h2>Could not sign in</h2>
        <p>{{ error }}</p>
        <RouterLink class="btn btn-primary empty-action" :to="{ name: 'preferences' }">
          Back to Preferences
        </RouterLink>
      </template>
    </div>
  </section>
</template>

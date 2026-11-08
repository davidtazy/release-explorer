<script setup lang="ts">
import { computed, ref } from 'vue'
import { useReleasesStore } from '@/stores/releases'
import { resetAvatarCache } from '@/lib/avatars'
import {
  disconnect,
  instanceHost,
  instanceUrl,
  isConnected,
  isOAuthConfigured,
  normalizeInstanceUrl,
  startLogin,
} from '@/lib/auth'

const store = useReleasesStore()

const url = ref(instanceUrl.value)
const submitting = ref(false)
const error = ref<string | null>(null)

const host = computed(() => instanceHost(instanceUrl.value))
const canSubmit = computed(() => isOAuthConfigured && !submitting.value)

async function onConnect(): Promise<void> {
  if (!canSubmit.value) return

  error.value = null
  submitting.value = true

  const nextInstance = normalizeInstanceUrl(url.value)
  if (nextInstance !== normalizeInstanceUrl(instanceUrl.value)) store.clearData()

  try {
    await startLogin(nextInstance)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not start the GitLab login.'
    submitting.value = false
  }
}

function onDisconnect(): void {
  disconnect()
  resetAvatarCache()
}
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <h2>Connection</h2>
      <span v-if="isConnected" class="status-pill"><span class="status-dot" /> Live</span>
    </div>

    <template v-if="isConnected">
      <p class="connection-user">
        {{ store.user ? `@${store.user.username}` : 'Authenticated session' }}
      </p>
      <p class="muted connection-meta">{{ host }}</p>
      <button type="button" class="btn btn-ghost btn-sm" @click="onDisconnect">Disconnect</button>
    </template>

    <form v-else class="connection-form" @submit.prevent="onConnect">
      <label class="field">
        <span class="field-label">GitLab URL</span>
        <input v-model="url" type="url" name="instance" placeholder="https://gitlab.com" />
      </label>

      <p class="hint">
        Sign in with GitLab to grant read-only (<code>read_api</code>) access. You will be
        redirected to GitLab and back; no token is pasted into this app.
      </p>

      <p v-if="!isOAuthConfigured" class="hint hint-error">
        OAuth is not configured. Set <code>VITE_GITLAB_CLIENT_ID</code> in <code>.env</code> and
        restart the dev server.
      </p>

      <p v-if="error" class="hint hint-error">{{ error }}</p>

      <div class="connection-actions">
        <button type="submit" class="btn btn-primary" :disabled="!canSubmit">
          {{ submitting ? 'Redirecting to GitLab…' : 'Connect with GitLab' }}
        </button>
      </div>
    </form>
  </section>
</template>

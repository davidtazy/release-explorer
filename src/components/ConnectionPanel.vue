<script setup lang="ts">
import { computed, ref } from 'vue'
import { useReleasesStore } from '@/stores/releases'
import {
  connect,
  disconnect,
  instanceHost,
  instanceUrl,
  isConnected,
  normalizeInstanceUrl,
} from '@/lib/auth'

const store = useReleasesStore()

const url = ref(instanceUrl.value)
const accessToken = ref('')
const submitting = ref(false)

const host = computed(() => instanceHost(instanceUrl.value))
const tokenSettingsUrl = computed(
  () => `${normalizeInstanceUrl(instanceUrl.value)}/-/user_settings/personal_access_tokens`,
)
const canSubmit = computed(() => accessToken.value.trim().length > 0 && !submitting.value)

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return

  const nextInstance = normalizeInstanceUrl(url.value)
  const changedInstance = nextInstance !== normalizeInstanceUrl(instanceUrl.value)

  connect(nextInstance, accessToken.value)
  accessToken.value = ''
  submitting.value = true

  if (changedInstance) store.clearData()

  try {
    await store.refreshAll()
  } finally {
    submitting.value = false
  }
}

function onDisconnect(): void {
  disconnect()
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

    <form v-else class="connection-form" @submit.prevent="onSubmit">
      <label class="field">
        <span class="field-label">GitLab URL</span>
        <input v-model="url" type="url" name="instance" placeholder="https://gitlab.com" />
      </label>

      <label class="field">
        <span class="field-label">Personal access token</span>
        <input
          v-model="accessToken"
          type="password"
          name="token"
          placeholder="glpat-…"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <p class="hint">
        Needs the <code>read_api</code> scope. The token is kept in this tab only
        (sessionStorage) and is never written to the cached data model.
      </p>

      <div class="connection-actions">
        <button type="submit" class="btn btn-primary" :disabled="!canSubmit">
          {{ submitting ? 'Connecting…' : 'Connect' }}
        </button>
        <a class="hint link" :href="tokenSettingsUrl" target="_blank" rel="noreferrer noopener">
          Create a token ↗
        </a>
      </div>
    </form>
  </section>
</template>

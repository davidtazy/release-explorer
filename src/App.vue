<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import {
  clearSignedOut,
  instanceHost,
  instanceUrl,
  isConnected,
  isOAuthConfigured,
  logout,
  signedOut,
  startLogin,
} from '@/lib/auth'
import { resetAvatarCache } from '@/lib/avatars'
import { useReleasesStore } from '@/stores/releases'

const store = useReleasesStore()
const route = useRoute()

const rocketUrl = `${import.meta.env.BASE_URL}rocket.svg`

const authError = ref<string | null>(null)
const startingLogin = ref(false)
const signingOut = ref(false)
const needsLogin = computed(
  () =>
    !isConnected.value &&
    !signedOut.value &&
    route.name !== 'callback' &&
    route.matched.length > 0,
)

let autoRefreshTimer: ReturnType<typeof setInterval> | undefined

async function ensureAuthenticated(): Promise<void> {
  if (!needsLogin.value || startingLogin.value) return

  authError.value = null
  startingLogin.value = true

  try {
    if (!isOAuthConfigured) {
      throw new Error(
        'GitLab OAuth is not configured. Set VITE_GITLAB_CLIENT_ID in .env and restart the dev server.',
      )
    }
    await startLogin(instanceUrl.value)
  } catch (caught) {
    authError.value =
      caught instanceof Error ? caught.message : 'Could not start the GitLab sign-in.'
    startingLogin.value = false
  }
}

function retryLogin(): void {
  startingLogin.value = false
  void ensureAuthenticated()
}

function signInAgain(): void {
  clearSignedOut()
  retryLogin()
}

async function onLogout(): Promise<void> {
  if (signingOut.value) return

  signingOut.value = true
  try {
    resetAvatarCache()
    await logout()
  } finally {
    signingOut.value = false
  }
}

onMounted(() => {
  void ensureAuthenticated()

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

watch(
  () => [isConnected.value, route.name, signedOut.value] as const,
  () => {
    void ensureAuthenticated()
  },
)
</script>

<template>
  <div v-if="needsLogin" class="auth-screen">
    <section class="panel auth-card">
      <img class="brand-mark" :src="rocketUrl" alt="" width="34" height="34" />
      <h1>Release Explorer</h1>

      <template v-if="authError">
        <p class="muted auth-message">{{ authError }}</p>
        <button type="button" class="btn btn-primary" @click="retryLogin">Try again</button>
      </template>
      <p v-else class="muted auth-message">
        Redirecting to GitLab to authorize read-only access…
      </p>
    </section>
  </div>

  <div v-else-if="signedOut && !isConnected" class="auth-screen">
    <section class="panel auth-card">
      <img class="brand-mark" :src="rocketUrl" alt="" width="34" height="34" />
      <h1>Signed out</h1>
      <p class="muted auth-message">
        Your GitLab session was cleared. Cached data stays on this browser, so signing back in
        restores it.
      </p>
      <button type="button" class="btn btn-primary" @click="signInAgain">
        Sign in with GitLab
      </button>
    </section>
  </div>

  <div v-else class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">
        <img class="brand-mark" :src="rocketUrl" alt="" width="34" height="34" />
        <span class="brand-text">
          <strong>Release Explorer</strong>
          <small>GitLab · read-only</small>
        </span>
      </RouterLink>

      <div class="header-actions">
        <RouterLink
          to="/preferences"
          class="connection-pill"
          :class="{ 'is-offline': !isConnected }"
          title="Open preferences"
        >
          <span v-if="isConnected" class="status-dot" />
          {{ isConnected ? (store.user ? `@${store.user.username}` : instanceHost(instanceUrl)) : 'Not connected' }}
        </RouterLink>

        <button
          v-if="isConnected"
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="signingOut"
          @click="onLogout"
        >
          {{ signingOut ? 'Signing out…' : 'Sign out' }}
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
      <main class="main">
        <RouterView />
      </main>
    </div>
  </div>
</template>

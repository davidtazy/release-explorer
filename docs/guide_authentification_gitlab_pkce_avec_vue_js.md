# Guide d'intégration OAuth2 PKCE avec GitLab Pages & Vue.js

Ce document décrit comment mettre en place un flux d'authentification sécurisé **OAuth 2.0 Authorization Code avec PKCE** (*Proof Key for Code Exchange*) pour une Single Page Application (SPA) Vue 3 hébergée sur **GitLab Pages**, tout en conservant la capacité de développer en local.

---

## 1. Configuration sur GitLab

Pour permettre l'authentification en local et en production sans secret côté client, vous devez enregistrer une application OAuth sur GitLab avec plusieurs URI de redirection.

### Étapes de création

1. Dans GitLab, rendez-vous dans **User Settings** (Profil) > **Applications** (ou dans les paramètres de votre Groupe / Projet > **Settings** > **Applications**).
2. Remplissez le formulaire :
   - **Name** : `Mon App Vue.js` (ou le nom de votre choix).
   - **Redirect URI** : Entrez les deux URLs (une par ligne) pour gérer le développement local et la production :
     ```text
     http://localhost:5173/callback
     https://<votre-pseudo>.gitlab.io/<votre-projet>/callback
     ```
   - **Confidential** : **Décochez la case** (indispensable pour une SPA frontend sans backend afin d'indiquer que le secret ne peut pas être gardé).
   - **Scopes** : Cochez `openid`, `profile`, `read_user` (et `api` si vous devez effectuer des actions d'écriture via l'API GitLab).
3. Cliquez sur **Save application**.
4. Négligez le secret et copiez uniquement l'**Application ID** (`client_id`).

---

## 2. Configuration de l'environnement Vue.js (Vite)

Créez les fichiers de variables d'environnement à la racine de votre projet Vue.js pour adapter les URLs automatiquement selon l'environnement.

### Fichier `.env` (Configuration de Production)
```env
VITE_GITLAB_URL=https://gitlab.com
VITE_GITLAB_CLIENT_ID=votre_client_id_gitlab
VITE_REDIRECT_URI=https://<votre-pseudo>.gitlab.io/<votre-projet>/callback
```

### Fichier `.env.local` (Configuration de Dev Local — ignoré par Git)
```env
VITE_REDIRECT_URI=http://localhost:5173/callback
```

---

## 3. Implémentation du Code Vue 3

### A. Helper PKCE (`src/utils/pkce.js`)
Ce fichier gère la génération cryptographique du `code_verifier` et du `code_challenge`.

```javascript
// Génération d'un code_verifier aléatoire sécurisé
export function generateCodeVerifier() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Calcul du code_challenge (SHA-256) à partir du verifier
export async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

---

### B. Composable d'Authentification (`src/composables/useAuth.js`)
Ce composable centralise la logique de connexion, de déconnexion et de récupération du jeton.

```javascript
import { ref } from 'vue';
import { generateCodeVerifier, generateCodeChallenge } from '../utils/pkce';

const accessToken = ref(localStorage.getItem('gitlab_access_token') || null);
const user = ref(JSON.parse(localStorage.getItem('gitlab_user') || 'null'));

export function useAuth() {
  const gitlabUrl = import.meta.env.VITE_GITLAB_URL;
  const clientId = import.meta.env.VITE_GITLAB_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_REDIRECT_URI;

  // 1. Démarrer le flux de connexion PKCE
  const login = async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    // Stockage du verifier en sessionStorage pour la phase de callback
    sessionStorage.setItem('pkce_code_verifier', verifier);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state: crypto.randomUUID(),
      scope: 'openid profile read_user',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `${gitlabUrl}/oauth/authorize?${params.toString()}`;
  };

  // 2. Échanger le code reçu contre un token d'accès
  const handleCallback = async (code) => {
    const verifier = sessionStorage.getItem('pkce_code_verifier');

    if (!verifier) {
      throw new Error('Code verifier introuvable dans le sessionStorage');
    }

    const response = await fetch(`${gitlabUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error_description || 'Échec de l’échange de jeton');
    }

    const data = await response.json();
    accessToken.value = data.access_token;
    localStorage.setItem('gitlab_access_token', data.access_token);
    sessionStorage.removeItem('pkce_code_verifier');

    await fetchUserProfile();
  };

  // 3. Récupérer le profil de l'utilisateur connecté
  const fetchUserProfile = async () => {
    if (!accessToken.value) return;

    const res = await fetch(`${gitlabUrl}/api/v4/user`, {
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
      },
    });

    if (res.ok) {
      const userData = await res.json();
      user.value = userData;
      localStorage.setItem('gitlab_user', JSON.stringify(userData));
    } else if (res.status === 401) {
      logout();
    }
  };

  // 4. Déconnexion
  const logout = () => {
    accessToken.value = null;
    user.value = null;
    localStorage.removeItem('gitlab_access_token');
    localStorage.removeItem('gitlab_user');
  };

  return {
    accessToken,
    user,
    login,
    handleCallback,
    logout,
  };
}
```

---

### C. Vue Callback (`src/views/CallbackView.vue`)
Cette vue intercepte la redirection de GitLab, extrait le code d'autorisation et finalise l'authentification.

```vue
<template>
  <div class="callback-container">
    <p v-if="loading">Authentification en cours...</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '../composables/useAuth';

const router = useRouter();
const route = useRoute();
const { handleCallback } = useAuth();

const loading = ref(true);
const error = ref(null);

onMounted(async () => {
  const code = route.query.code;
  if (!code) {
    error.value = 'Code d’autorisation manquant dans l’URL.';
    loading.value = false;
    return;
  }

  try {
    await handleCallback(code);
    router.push('/');
  } catch (err) {
    error.value = err.message || 'Erreur lors de la connexion.';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.error {
  color: red;
}
</style>
```

---

### D. Exemple d'utilisation dans un composant (`src/views/HomeView.vue`)

```vue
<template>
  <main>
    <h1>Mon Application Vue.js</h1>

    <div v-if="user">
      <p>Bienvenue, <strong>{{ user.name }}</strong> (@{{ user.username }}) !</p>
      <img :src="user.avatar_url" alt="Avatar" width="64" />
      <br />
      <button @click="logout">Se déconnecter</button>
    </div>

    <div v-else>
      <button @click="login">Se connecter avec GitLab</button>
    </div>
  </main>
</template>

<script setup>
import { useAuth } from '../composables/useAuth';

const { user, login, logout } = useAuth();
</script>
```

---

## 4. Test du Déploiement Local & GitLab Pages

### En développement local
1. Lancez le serveur Vite : `npm run dev` (par défaut sur `http://localhost:5173`).
2. Cliquez sur **Se connecter avec GitLab**.
3. Après redirection sur `http://localhost:5173/callback`, l'application valide l'échange et affiche le profil utilisateur.

### En production sur GitLab Pages
1. Assurez-vous de définir le `base` dans `vite.config.js` si votre application est dans un sous-dossier (ex: `https://user.gitlab.io/projet/`).
2. La variable `VITE_REDIRECT_URI` du fichier `.env` sera chargée automatiquement lors du build et basculera sur l'URL de production.
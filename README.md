# GitLab Release Explorer

A minimal Vue 3 + TypeScript + Pinia app that shows the latest release of every
project in the GitLab groups you can access.

It is **read-only**: the app only runs GraphQL queries (`currentUser`, `group`,
`project`) and reads release/avatar data. It never mutates anything on GitLab.

## Features

- **Preferences view** (`/preferences`) — theme selection, the selectable group
  tree, and the cache summary live here instead of cluttering the main view.
- **Group tree** — `currentUser.groups` (groups you have access to) is rendered
  as a selectable tree. Selecting a parent group automatically covers its
  subgroups.
- **Grouped project cards** — the main view shows one card per group, listing
  project name, latest release tag, and release date. A sort control orders the
  groups and projects by **name** or by **release date** (newest first).
- **Hide a group** — the ⊖ icon on a card hides that group's own projects. Its
  subgroups stay visible. In Preferences → Your groups, groups that directly
  contain projects get an eye icon that shows or hides them again, independently
  of the selection checkbox.
- **Project detail view** — click a project to see its releases with a range
  filter: last day, week, month, or year. The filter defaults to
  **last month**; the toolbar shows how many releases match and the oldest
  release date in that period.
  - Standard pagination under the table: **rows per page** (a global, persisted
    preference), numbered pages, and previous/next controls.
- **Theme selector** — Light, Dark, or System (follows the operating system),
  persisted in `localStorage` under `gitlab-release-explorer.theme`.
- **Persistent, timestamped cache** — fetched data is stored in `localStorage`
  together with `fetchedAt` timestamps. The cache is considered stale after
  **1 hour**; stale data is refreshed automatically on load, after selecting a
  group, and by a once-a-minute check.
- **Group and project avatars** — logos uploaded to GitLab are downloaded with
  the same token and shown left of group and project names.
- **Manual refresh** — **Refresh groups & releases** on the main view refetches
  the group list and every selected group snapshot; **Refresh release history**
  on a project page refetches that project's releases only.
- **Storage summary + clear** — the Preferences view reports how many groups,
  projects, and releases are cached, plus the date range and capture time.
  Clearing is a two-click confirmation and only removes cached data (the
  connection stays).
- **OAuth sign-in (PKCE)** — the app uses GitLab's Authorization Code flow with
  PKCE and the `read_api` scope. Unauthenticated visits redirect straight to
  GitLab; after authorizing, the app returns to `/callback` and loads your
  groups. Access and refresh tokens live in `sessionStorage` (per tab), the
  access token refreshes automatically, and neither is written to the cached
  data model. Closing the tab signs you out.
- **Sign out** — the header button revokes the access/refresh tokens at
  GitLab's `/oauth/revoke`, clears the local session and avatars, then shows a
  signed-out screen. Cached GitLab data stays on the browser and is reused when
  the same user signs back in. Signing in again is explicit, so logging out
  does not immediately bounce back to GitLab.
- Light/dark theme, responsive layout, no UI framework.

## Requirements

- Node.js 20+ and npm.
- A GitLab **OAuth application** with the `read_api` scope and a redirect URI
  that matches `VITE_REDIRECT_URI` (default `http://localhost:5173/callback`).
- For self-managed GitLab, set `VITE_GITLAB_URL` in `.env` and register the
  OAuth application on that instance. The GraphQL and OAuth endpoints must allow
  browser requests (CORS).

## Getting started

Create the OAuth application in GitLab (User settings → Applications):

| Field | Value |
| --- | --- |
| Name | Release Explorer |
| Redirect URI | the value of `VITE_REDIRECT_URI`, e.g. `http://localhost:5173/callback` |
| Scopes | `read_api` |

Copy the **Application ID** into `.env`:

```sh
VITE_GITLAB_CLIENT_ID=your-application-id
```

### Environment variables

All values are read at dev-server start / build time, so restart after changing
them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_GITLAB_CLIENT_ID` | — | OAuth application id (public) |
| `VITE_GITLAB_URL` | `https://gitlab.com` | GitLab instance; wins over the stored instance |
| `VITE_APP_BASE_URL` | `/` | Path the app is served from, useful for subpath deployments |
| `VITE_REDIRECT_URI` | `<origin><base>callback` | Exact OAuth callback; must match the GitLab application |

Local development `.env`:

```sh
VITE_GITLAB_CLIENT_ID=...
VITE_GITLAB_URL=https://gitlab.com
VITE_APP_BASE_URL=/
VITE_REDIRECT_URI=http://localhost:5173/callback
```

Production, served under a subpath:

```sh
VITE_GITLAB_CLIENT_ID=...
VITE_GITLAB_URL=https://gitlab.example.com
VITE_APP_BASE_URL=/release-explorer/
VITE_REDIRECT_URI=https://apps.example.com/release-explorer/callback
```

`VITE_APP_BASE_URL` drives Vite's `base`, the router base, asset URLs and the
default callback path; the deployment must serve the built app from that same
path. `VITE_REDIRECT_URI` is used verbatim for both the authorize redirect and
the token exchange.

Then start the app:

```sh
npm install
npm run dev
```

Open the printed URL. The app immediately redirects you to GitLab to authorize
read-only access; after approving, you land back on `/callback`, the tokens are
stored in this tab, and you are taken to the **Releases** page. Open
**Preferences** from the header to pick the groups you want to follow.

**Signing out** is available in the header (next to your username). It revokes
the tokens through GitLab's `/oauth/revoke` endpoint, clears the tokens and
avatars, and shows a "Signed out" screen with a **Sign in with GitLab** button.
Cached groups, releases, selections and hidden-group flags are kept, so the
same user resumes quickly after signing back in. The app does not immediately
redirect to GitLab again after an explicit sign-out. Closing the tab also ends
the session because tokens are kept in `sessionStorage`.

The cache is not scoped per GitLab user. On a shared browser, clear the cached
data from Preferences before switching accounts.

> The OAuth client id is public. The app never asks for or stores a personal
> access token; the client secret is not used (PKCE public client). If GitLab
> rejects the token exchange with `invalid_client`, make sure the application is
> not marked **Confidential** in GitLab.

> **Windows PowerShell note:** if `npm` is blocked by the execution policy, use
> `npm.cmd` (and `npx.cmd`) instead, e.g. `npm.cmd run dev`.

### Scripts

```sh
npm run dev          # dev server with hot reload
npm run build        # type-check + production build
npm run type-check   # vue-tsc only
npm run test:unit    # Vitest unit tests
npm run lint         # oxlint + ESLint (with --fix)

npm run logos:fake-gitlab      # generate/refresh the fixture logo.png files
npm run seed:fake-gitlab:dry   # validate fake-gitlab/ without API calls
npm run seed:fake-gitlab       # create/update the fixture on GitLab
```

## Fake GitLab data

`fake-gitlab/` is a fixture tree that mirrors a GitLab group hierarchy. Every
folder is a (sub)group and every leaf folder containing a `releases.json`
becomes a project. A dev-only seeder creates or updates the groups, projects,
and releases through the GitLab REST API, and uploads each folder's
`logo.png` as the group/project avatar.

```sh
# .env (git-ignored)
TOKEN=glpat-...              # seeder only; needs the api scope
FAKE_GITLAB_ROOT=fake-gitlab # or an existing parent + leaf, e.g. me/fake-gitlab
```

```sh
npm run seed:fake-gitlab:dry   # print the plan, make no API calls
npm run seed:fake-gitlab       # seed GitLab (idempotent, never deletes)
```

- See `fake-gitlab/README.md` for the folder, `releases.json`, and logo
  formats.
- `logo.png` in a folder is uploaded as that group's or project's avatar on
  every seed run. Generate the fixture logos with
  `npm run logos:fake-gitlab` (add `-- --force` to regenerate them).
- `daysAgo` in each release is converted to an absolute `released_at` at seed
  time, so rerunning refreshes the dates used by the range filters.
- `FAKE_GITLAB_ROOT` may be a top-level group name **or** a full path under an
  existing group. GitLab.com did not allow this account to create a top-level
  group, so the working setup uses `FAKE_GITLAB_ROOT=david_tazy/fake-gitlab`.
- Seeding requires the `api` scope; the app itself only needs `read_api`.
  `TOKEN` is only read by the seeder script and is never exposed to the app.
- The app stays read-only — the seeder is a separate dev script.

## GraphQL design

There are exactly three query documents in `src/api/gitlab.ts`; each logical
fetch is a single GraphQL operation (with cursor pagination where needed), so
there is no per-project N+1 fan-out:

1. `ReleaseExplorerGroups` — `currentUser.groups` (100 per page) with
   `pageInfo`, giving the selectable group tree.
2. `ReleaseExplorerGroupProjects` — for one selected group:
   `group(fullPath: $fullPath).projects(includeSubgroups: true, includeArchived:
   false)` with each project's `releases(first: 1, sort: RELEASED_AT_DESC)`.
   This powers the project/latest-release table in one request (per page of
   projects).
3. `ReleaseExplorerProjectReleases` — `project(fullPath: $fullPath)
   .releases(first: 100, after: $after, sort: RELEASED_AT_DESC)` with
   `pageInfo`. The client follows the cursor until every release is fetched
   (capped by `MAX_PAGES`), then the detail view filters by date range and
   paginates the result locally.

Requests are sent to `<instance>/api/graphql` with
`Authorization: Bearer <OAuth access token>`.

Avatars are binary rather than GraphQL data: the app downloads them from
`GET <instance>/api/v4/groups/:id/avatar` and
`GET <instance>/api/v4/projects/:id/avatar` with the same OAuth token, turns
them into in-memory blob URLs, and caches them for the session (so each avatar
is requested once per session).

## Persisted data model

`src/types/gitlab.ts` defines the model; `src/stores/releases.ts` owns it.

```
{
  version, instanceUrl, user,
  groups, groupsFetchedAt,   // each group carries visible: boolean
  selectedPaths,
  snapshots: { [groupPath]: { fetchedAt, projects[] } },
  details:   { [projectPath]: { fetchedAt, name, webUrl, releases[] } }
}
```

- Stored under the `localStorage` key `gitlab-release-explorer.state`.
- `visible` on each group controls whether that group's **own** projects appear
  in the main view. It is independent from the selection checkbox: ticking a
  group selects it for fetching (a parent covers its subgroups), while the eye
  icon next to groups that directly contain projects shows or hides their
  projects. Hiding a group never hides its subgroups.
- Cached data is ignored if the saved `instanceUrl` no longer matches the
  current one.
- The OAuth access/refresh tokens are stored separately in `sessionStorage`,
  never in this model.
- `STALE_AFTER_MS = 3_600_000` (one hour).

## Project structure

```
fake-gitlab/               fixture tree: groups, projects, releases.json
scripts/
  seed-fake-gitlab.mjs     dev-only GitLab seeder (REST, idempotent)
  make-fake-logos.mjs      generates the fixture logo.png files
src/
  api/gitlab.ts            GraphQL queries, client, error handling
  components/              group tree, storage, avatars
  lib/                     auth, avatars, formatting, pagination, release filtering, grouping, theme, tree helpers
  router/index.ts          "/" cards view, "/project?path=…", "/preferences", "/callback"
  stores/releases.ts       Pinia store, persistence, staleness, refresh
  types/gitlab.ts          Data model
  views/                   ReleasesView, ProjectReleasesView, PreferencesView, AuthCallbackView
```

# GitLab Release Explorer

A minimal Vue 3 + TypeScript + Pinia app that shows the latest release of every
project in the GitLab groups you can access.

It is **read-only**: the app only runs GraphQL queries (`currentUser`, `group`,
`project`). It never mutates anything on GitLab.

## Features

- **Preferences view** (`/preferences`) — connection settings, the selectable
  group tree, and the cache summary live here instead of cluttering the main
  view.
- **Group tree** — `currentUser.groups` (groups you have access to) is rendered
  as a selectable tree. Selecting a parent group automatically covers its
  subgroups.
- **Grouped project cards** — the main view shows one card per group, listing
  project name, latest release tag, and release date.
- **Project detail view** — click a project to see its most recent releases
  (up to 20) with a range filter: last day, week, month, year, or any time.
  - With **Any time**, only releases from the last 12 months are shown. If
    there were none, the single latest release is shown instead (when the
    project has at least one release).
- **Persistent, timestamped cache** — fetched data is stored in `localStorage`
  together with `fetchedAt` timestamps. The cache is considered stale after
  **1 hour**; stale data is refreshed automatically on load, after selecting a
  group, and by a once-a-minute check.
- **Manual refresh** — a Refresh button forces a refetch of groups and the
  selected group snapshots.
- **Storage summary + clear** — the Preferences view reports how many groups,
  projects, and releases are cached, plus the date range and capture time.
  Clearing is a two-click confirmation and only removes cached data (the
  connection stays).
- **Session-only token** — the personal access token lives in `sessionStorage`
  and is never written to the persisted data model.
- Light/dark theme, responsive layout, no UI framework.

## Requirements

- Node.js 20+ and npm.
- A GitLab personal access token with the **`read_api`** scope. Create one at
  `https://gitlab.com/-/user_settings/personal_access_tokens`.
- For self-managed GitLab, the instance URL is configurable in the app. The
  GraphQL endpoint must allow browser requests (CORS); `gitlab.com` does.

## Getting started

```sh
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`), go to **Preferences**,
paste the instance URL and token, and click **Connect**. Pick the groups you
want to follow in the same view, then return to the releases page.

> **Windows PowerShell note:** if `npm` is blocked by the execution policy, use
> `npm.cmd` (and `npx.cmd`) instead, e.g. `npm.cmd run dev`.

### Scripts

```sh
npm run dev          # dev server with hot reload
npm run build        # type-check + production build
npm run type-check   # vue-tsc only
npm run test:unit    # Vitest unit tests
npm run lint         # oxlint + ESLint (with --fix)

npm run seed:fake-gitlab:dry   # validate fake-gitlab/ without API calls
npm run seed:fake-gitlab       # create/update the fixture on GitLab
```

## Fake GitLab data

`fake-gitlab/` is a fixture tree that mirrors a GitLab group hierarchy. Every
folder is a (sub)group and every leaf folder containing a `releases.json`
becomes a project. A dev-only seeder creates or updates the groups, projects,
and releases through the GitLab REST API.

```sh
# .env (git-ignored)
TOKEN=glpat-...              # needs the api scope for seeding
FAKE_GITLAB_ROOT=fake-gitlab # or an existing parent + leaf, e.g. me/fake-gitlab
```

```sh
npm run seed:fake-gitlab:dry   # print the plan, make no API calls
npm run seed:fake-gitlab       # seed GitLab (idempotent, never deletes)
```

- See `fake-gitlab/README.md` for the folder and `releases.json` format.
- `daysAgo` in each release is converted to an absolute `released_at` at seed
  time, so rerunning refreshes the dates used by the range filters.
- `FAKE_GITLAB_ROOT` may be a top-level group name **or** a full path under an
  existing group. GitLab.com did not allow this account to create a top-level
  group, so the working setup uses `FAKE_GITLAB_ROOT=david_tazy/fake-gitlab`.
- Seeding requires the `api` scope; the app itself only needs `read_api`.
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
   .releases(first: $first, sort: RELEASED_AT_DESC)` for the detail view
   (`RELEASES_PER_PROJECT = 20`). Filtering by date range happens client-side on
   this fetched window.

Requests are sent to `<instance>/api/graphql` with
`Authorization: Bearer <token>`.

## Persisted data model

`src/types/gitlab.ts` defines the model; `src/stores/releases.ts` owns it.

```
{
  version, instanceUrl, user,
  groups, groupsFetchedAt,
  selectedPaths,
  snapshots: { [groupPath]: { fetchedAt, projects[] } },
  details:   { [projectPath]: { fetchedAt, name, webUrl, releases[] } }
}
```

- Stored under the `localStorage` key `gitlab-release-explorer.state`.
- Cached data is ignored if the saved `instanceUrl` no longer matches the
  current one.
- The token is stored separately under `sessionStorage`, never in this model.
- `STALE_AFTER_MS = 3_600_000` (one hour).

## Project structure

```
fake-gitlab/               fixture tree: groups, projects, releases.json
scripts/
  seed-fake-gitlab.mjs     dev-only GitLab seeder (REST, idempotent)
src/
  api/gitlab.ts            GraphQL queries, client, error handling
  components/              Connection, group tree, storage panels
  lib/                     auth, formatting, release filtering, tree helpers
  router/index.ts          "/" cards view, "/project?path=…", "/preferences"
  stores/releases.ts       Pinia store, persistence, staleness, refresh
  types/gitlab.ts          Data model
  views/                   ReleasesView, ProjectReleasesView, PreferencesView
```

# fake-gitlab

Local fixture tree that mirrors a small GitLab group hierarchy. The folder
names are the source of truth: every **group** becomes a subgroup and every
**leaf** folder containing a `releases.json` becomes a project.

```
fake-gitlab/                     group: fake-gitlab
├── logo.png                     group avatar
├── portal/                      project: fake-gitlab/portal
│   ├── logo.png                 project avatar
│   └── releases.json
├── platform/                    group: fake-gitlab/platform
│   ├── logo.png
│   ├── web-app/                 project: fake-gitlab/platform/web-app
│   │   ├── logo.png
│   │   └── releases.json
│   ├── api-service/             project: fake-gitlab/platform/api-service
│   │   ├── logo.png
│   │   └── releases.json
│   └── core/                    group: fake-gitlab/platform/core
│       ├── logo.png
│       └── legacy-tool/         project: fake-gitlab/platform/core/legacy-tool
│           ├── logo.png
│           └── releases.json
└── tools/                       group: fake-gitlab/tools
    ├── logo.png
    ├── cli/                     project: fake-gitlab/tools/cli
    │   ├── logo.png
    │   └── releases.json
    └── sandbox/                 project: fake-gitlab/tools/sandbox (no releases)
        ├── logo.png
        └── releases.json
```

## Logos

Every folder may contain a `logo.png` (or `logo.jpg`, `logo.jpeg`, `logo.gif`,
`logo.webp`). The seeder uploads it as the avatar of that group or project, and
the app shows it left of the group/project name.

The checked-in logos are generated tiles with the entity's initials:

```sh
npm run logos:fake-gitlab              # create missing logos only
npm run logos:fake-gitlab -- --force   # regenerate all of them
```

Replace any `logo.png` with a real image (≤ 200 KB) and re-seed to change the
avatar on GitLab.

## `releases.json`

```json
{
  "project": "web-app",
  "releases": [
    {
      "tagName": "v2.4.0",
      "name": "Web App 2.4.0",
      "description": "Markdown release notes.",
      "daysAgo": 0.25
    }
  ]
}
```

- `project` is optional; when present it must match the folder name.
- `tagName` is required and must be unique inside a project.
- `daysAgo` is required, a non-negative number, and may be fractional
  (`0.25` = 6 hours). It is converted to an absolute `released_at` date **when
  the seeder runs**, so dates stay useful every time you re-seed.
- `name` and `description` are optional; the seeder derives a name from the
  project and tag when omitted.

The fixture intentionally covers the UI cases:

| Project | What it exercises |
| --- | --- |
| `platform/web-app` | releases in every range (hours → >1 year); 25 in the last month for pagination |
| `portal` | release within the last 24 hours |
| `platform/api-service` | week/month ranges |
| `platform/core/legacy-tool` | “Any time” fallback (nothing in the last year) |
| `tools/cli` | a single recent release |
| `tools/sandbox` | a project without any release |

`platform/web-app` has 28 releases. The detail view loads the full history once
and paginates it locally, so the default **Last month** filter spans 25 of them
and shows two pages at 20 rows per page.

## Seeding GitLab

Add a personal access token with the **`api`** scope to the repository `.env`:

```
TOKEN=glpat-...
```

Then run:

```sh
npm run seed:fake-gitlab:dry   # validate the tree, no API calls
npm run seed:fake-gitlab       # create groups/projects/releases on GitLab
```

The script is idempotent: existing groups and projects are reused, releases are
updated in place (which also refreshes their relative dates), and avatars are
re-uploaded. It never deletes anything.

### Choosing the root group

By default the root folder maps to a top-level group named `fake-gitlab`. If
GitLab does not let the account create top-level groups (GitLab.com returned
403 during setup), point `FAKE_GITLAB_ROOT` at an **existing** parent group
plus a new leaf instead:

```
FAKE_GITLAB_ROOT=david_tazy/fake-gitlab
```

The parent (`david_tazy` here) must exist and be manageable by the token; the
`fake-gitlab` leaf is created if missing. This is the configuration currently
used in this repository's `.env`.

Optional environment variables (environment wins over `.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `GITLAB_URL` | `https://gitlab.com` | GitLab instance base URL |
| `FAKE_GITLAB_ROOT` | `fake-gitlab` | Root group name or full path |
| `FAKE_GITLAB_DIR` | `fake-gitlab` | Local fixture folder |
| `FAKE_GITLAB_VISIBILITY` | `private` | `private`, `internal`, or `public` |

After seeding, connect the app with a **`read_api`** token. The `fake-gitlab`
group and its subgroups appear in the tree; selecting the root group shows all
six projects.

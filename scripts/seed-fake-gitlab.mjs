#!/usr/bin/env node
/**
 * Create the `fake-gitlab` fixture tree on a GitLab instance.
 *
 * The local folder tree is the source of truth:
 *   - every folder is a group/subgroup,
 *   - every leaf folder containing `releases.json` is a project.
 *
 * Usage:
 *   node scripts/seed-fake-gitlab.mjs --dry-run   # validate the tree only
 *   node scripts/seed-fake-gitlab.mjs             # create/update on GitLab
 *
 * Credentials: `TOKEN` (fallback: GITLAB_TOKEN) from `.env` or the environment.
 * The token needs the `api` scope. This script never deletes anything.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, extname, join, relative, resolve } from 'node:path'

const DAY_MS = 86_400_000
const RELEASES_FILE = 'releases.json'
const LOGO_FILES = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.gif', 'logo.webp']
const LOGO_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}
const VISIBILITIES = ['private', 'internal', 'public']

const flags = new Set(process.argv.slice(2))
const DRY_RUN = flags.has('--dry-run') || flags.has('-n')
const SHOW_HELP = flags.has('--help') || flags.has('-h')

const repoRoot = process.cwd()
loadDotEnv(join(repoRoot, '.env'))

const dataDir = resolve(repoRoot, process.env.FAKE_GITLAB_DIR ?? 'fake-gitlab')
const rootGroup = (process.env.FAKE_GITLAB_ROOT ?? 'fake-gitlab').trim()
const visibility = (process.env.FAKE_GITLAB_VISIBILITY ?? 'private').trim().toLowerCase()
const baseUrl = normalizeBaseUrl(
  process.env.GITLAB_URL ??
    process.env.GITLAB_INSTANCE ??
    process.env.CI_SERVER_URL ??
    'https://gitlab.com',
)
const apiBase = `${baseUrl}/api/v4`
const token = firstNonEmpty(
  process.env.TOKEN,
  process.env.GITLAB_TOKEN,
  process.env.GL_TOKEN,
  process.env.PRIVATE_TOKEN,
)

if (SHOW_HELP) {
  printHelp()
  process.exit(0)
}

class ApiError extends Error {
  constructor(method, path, status, statusText, detail) {
    super(`${method} ${path} -> ${status} ${statusText}${detail ? `: ${detail}` : ''}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function printHelp() {
  console.log(`Seed the fake-gitlab fixture on GitLab.

Usage:
  node scripts/seed-fake-gitlab.mjs [--dry-run]

Options:
  -n, --dry-run   Validate fake-gitlab/ and print the plan; make no API calls.
  -h, --help      Show this help.

Credentials:
  TOKEN in .env (or GITLAB_TOKEN in the environment) with the api scope.

Optional environment variables:
  GITLAB_URL              GitLab base URL (default https://gitlab.com)
  FAKE_GITLAB_ROOT        Root group path (default fake-gitlab)
  FAKE_GITLAB_DIR         Local fixture folder (default fake-gitlab)
  FAKE_GITLAB_VISIBILITY  private | internal | public (default private)

The script is idempotent: groups and projects are reused when they already
exist, releases are created or updated, avatars are re-uploaded, and nothing is
ever deleted. Every folder may contain a logo.png (or logo.jpg/jpeg/gif/webp):
it is uploaded as that group's or project's avatar. Generate the fixture logos
with: node scripts/make-fake-logos.mjs`)
}

function loadDotEnv(file) {
  if (!existsSync(file)) return

  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue

    const [, key, rawValue] = match
    // Real environment variables always win over the file.
    if (process.env[key] !== undefined) continue

    let value = rawValue.trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

function normalizeBaseUrl(value) {
  const input = value.trim() || 'https://gitlab.com'
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`

  let url
  try {
    url = new URL(withProtocol)
  } catch {
    throw new Error(`Invalid GitLab URL: ${value}`)
  }

  const pathname = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/api\/(?:v4|graphql)$/i, '')
    .replace(/\/+$/, '')

  return `${url.protocol}//${url.host}${pathname}`
}

function assertPathSegment(value, where) {
  if (!value || value.startsWith('-') || !/^[a-z0-9][a-z0-9_.-]*$/i.test(value)) {
    throw new Error(
      `${where}: "${value}" is not a valid GitLab path segment ` +
        '(letters, digits, "_", "-", "."; must start with a letter or digit).',
    )
  }
  if (/\.(?:git|atom)$/i.test(value)) {
    throw new Error(`${where}: "${value}" cannot end with .git or .atom.`)
  }
}

function readReleases(projectDir, projectName) {
  const file = join(projectDir, RELEASES_FILE)
  const label = relative(repoRoot, file)
  let parsed

  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${label}: invalid JSON (${error.message})`)
  }

  const manifest = Array.isArray(parsed) ? { releases: parsed } : parsed
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.releases)) {
    throw new Error(`${label}: expected an object with a "releases" array.`)
  }
  if (manifest.project !== undefined && manifest.project !== projectName) {
    throw new Error(
      `${label}: "project" is "${manifest.project}" but the folder is "${projectName}".`,
    )
  }

  const seenTags = new Set()
  return manifest.releases.map((release, index) => {
    const where = `${label}: releases[${index}]`
    if (!release || typeof release !== 'object') {
      throw new Error(`${where}: expected an object.`)
    }

    const tagName = typeof release.tagName === 'string' ? release.tagName.trim() : ''
    if (!tagName) throw new Error(`${where}: "tagName" is required.`)
    if (/\s/.test(tagName)) throw new Error(`${where}: "tagName" cannot contain spaces.`)
    if (seenTags.has(tagName)) throw new Error(`${where}: duplicate tag "${tagName}".`)
    seenTags.add(tagName)

    const daysAgo = Number(release.daysAgo)
    if (!Number.isFinite(daysAgo) || daysAgo < 0) {
      throw new Error(`${where}: "daysAgo" must be a non-negative number.`)
    }

    return {
      tagName,
      name:
        typeof release.name === 'string' && release.name.trim()
          ? release.name.trim()
          : `${projectName} ${tagName}`,
      description: typeof release.description === 'string' ? release.description : '',
      daysAgo,
    }
  })
}

function scanGroup(dir, groupPath) {
  assertPathSegment(basename(dir), `folder "${relative(repoRoot, dir)}"`)

  const node = {
    type: 'group',
    name: basename(dir),
    path: groupPath,
    logo: findLogo(dir),
    children: [],
  }
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name))

  for (const entry of entries) {
    const childDir = join(dir, entry.name)
    assertPathSegment(entry.name, `folder "${relative(repoRoot, childDir)}"`)

    if (existsSync(join(childDir, RELEASES_FILE))) {
      node.children.push({
        type: 'project',
        name: entry.name,
        path: `${groupPath}/${entry.name}`,
        logo: findLogo(childDir),
        releases: readReleases(childDir, entry.name),
      })
    } else {
      node.children.push(scanGroup(childDir, `${groupPath}/${entry.name}`))
    }
  }

  return node
}

function findLogo(dir) {
  for (const name of LOGO_FILES) {
    const file = join(dir, name)
    if (existsSync(file)) return file
  }
  return null
}

function countTree(node) {
  if (node.type === 'project') {
    return { groups: 0, projects: 1, releases: node.releases.length }
  }

  const totals = { groups: 1, projects: 0, releases: 0 }
  for (const child of node.children) {
    const childTotals = countTree(child)
    totals.groups += childTotals.groups
    totals.projects += childTotals.projects
    totals.releases += childTotals.releases
  }
  return totals
}

function printPlan(node, depth = 0) {
  const pad = '  '.repeat(depth)
  if (node.type === 'group') {
    console.log(`${pad}${node.path.split('/').pop()}  (group${node.logo ? ', logo' : ''})`)
    for (const child of node.children) printPlan(child, depth + 1)
    return
  }

  const count = node.releases.length
  console.log(
    `${pad}${node.name}  (project, ${count} release${count === 1 ? '' : 's'}${node.logo ? ', logo' : ''})`,
  )
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function describePayload(payload) {
  if (payload === null || payload === undefined) return ''
  if (typeof payload === 'string') return payload.slice(0, 400)

  const message = payload.message ?? payload.error
  if (Array.isArray(message)) return message.join('; ').slice(0, 400)
  if (typeof message === 'string') return message.slice(0, 400)
  return JSON.stringify(payload).slice(0, 400)
}

async function apiRequest(path, { method = 'GET', body, allow404 = false } = {}) {
  const headers = { 'PRIVATE-TOKEN': token }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    let response
    try {
      const options = { method, headers }
      if (body !== undefined) options.body = JSON.stringify(body)

      response = await fetch(`${apiBase}${path}`, options)
    } catch (error) {
      throw new Error(`Cannot reach ${apiBase}: ${error.message}`)
    }

    const text = await response.text()
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }

    if (response.status === 404 && allow404) return null

    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 10) * 1000
          : (attempt + 1) * 2000,
      )
      continue
    }

    if (!response.ok) {
      throw new ApiError(
        method,
        path,
        response.status,
        response.statusText,
        describePayload(payload),
      )
    }

    return payload
  }
}

async function uploadAvatar(resource, id, filePath) {
  const extension = extname(filePath).toLowerCase()
  const form = new FormData()
  form.append(
    'avatar',
    new Blob([readFileSync(filePath)], { type: LOGO_TYPES[extension] ?? 'application/octet-stream' }),
    basename(filePath),
  )

  let response
  try {
    response = await fetch(`${apiBase}/${resource}/${id}`, {
      method: 'PUT',
      headers: { 'PRIVATE-TOKEN': token },
      body: form,
    })
  } catch (error) {
    throw new Error(`Cannot reach ${apiBase}: ${error.message}`)
  }

  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!response.ok) {
    throw new ApiError(
      'PUT',
      `/${resource}/${id}`,
      response.status,
      response.statusText,
      describePayload(payload),
    )
  }

  return payload
}

async function ensureGroup(fullPath, parentId, description) {
  const existing = await apiRequest(`/groups/${encodeURIComponent(fullPath)}`, { allow404: true })
  if (existing) return { group: existing, created: false }

  const leaf = fullPath.split('/').pop()
  try {
    const group = await apiRequest('/groups', {
      method: 'POST',
      body: {
        name: leaf,
        path: leaf,
        visibility,
        ...(parentId ? { parent_id: parentId } : {}),
        ...(description ? { description } : {}),
      },
    })
    return { group, created: true }
  } catch (error) {
    if (error instanceof ApiError && error.status === 400 && /taken/i.test(error.detail)) {
      throw new Error(
        `Group "${fullPath}" already exists but is not accessible with this token. ` +
          'Use a token with the api scope for its owner, or set FAKE_GITLAB_ROOT to another name.',
      )
    }
    throw error
  }
}

async function resolveParentId(fullPath) {
  const segments = fullPath.split('/')
  if (segments.length < 2) return null

  const parentPath = segments.slice(0, -1).join('/')
  try {
    const parent = await apiRequest(`/groups/${encodeURIComponent(parentPath)}`)
    return parent.id
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Error(
        `Parent group "${parentPath}" does not exist or is not accessible with this token. ` +
          'Create it first, or set FAKE_GITLAB_ROOT to a top-level group name.',
      )
    }
    throw error
  }
}

async function ensureProject(node, namespaceId) {
  const existing = await apiRequest(`/projects/${encodeURIComponent(node.path)}`, {
    allow404: true,
  })
  if (existing) return { project: existing, created: false }

  try {
    const project = await apiRequest('/projects', {
      method: 'POST',
      body: {
        name: node.name,
        path: node.name,
        namespace_id: namespaceId,
        visibility,
        initialize_with_readme: true,
        description: 'Fake project seeded for the GitLab Release Explorer.',
      },
    })
    return { project, created: true }
  } catch (error) {
    if (error instanceof ApiError && error.status === 400 && /taken/i.test(error.detail)) {
      throw new Error(`Project "${node.path}" already exists but is not accessible with this token.`)
    }
    throw error
  }
}

async function waitForDefaultBranch(project) {
  let current = project
  for (let attempt = 0; attempt < 20 && !current.default_branch; attempt += 1) {
    await sleep(500)
    current = await apiRequest(`/projects/${current.id}`)
  }

  if (!current.default_branch) {
    throw new Error(
      `Project "${current.path_with_namespace}" has no default branch. ` +
        'Create an initial commit in it, then rerun the seeder.',
    )
  }
  return current
}

async function upsertRelease(project, release, ref, seedTime) {
  const releasedAt = new Date(seedTime - release.daysAgo * DAY_MS).toISOString()

  try {
    await apiRequest(`/projects/${project.id}/releases`, {
      method: 'POST',
      body: {
        tag_name: release.tagName,
        name: release.name,
        description: release.description,
        ref,
        released_at: releasedAt,
      },
    })
    return 'created'
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error

    // Release already exists: refresh it in place (which also refreshes its date).
    await apiRequest(`/projects/${project.id}/releases/${encodeURIComponent(release.tagName)}`, {
      method: 'PUT',
      body: {
        name: release.name,
        description: release.description,
        released_at: releasedAt,
      },
    })
    return 'updated'
  }
}

async function seedProject(node, namespaceId, stats, seedTime) {
  try {
    const { project, created } = await ensureProject(node, namespaceId)
    stats.projectsCreated += created ? 1 : 0
    stats.projectsReused += created ? 0 : 1

    let logoStatus = ''
    if (node.logo) {
      logoStatus = await syncAvatar('projects', project.id, node.logo, stats)
    }

    const ready = await waitForDefaultBranch(project)
    let createdReleases = 0
    let updatedReleases = 0

    for (const release of node.releases) {
      const result = await upsertRelease(ready, release, ready.default_branch, seedTime)
      if (result === 'created') createdReleases += 1
      else updatedReleases += 1
    }

    stats.releasesCreated += createdReleases
    stats.releasesUpdated += updatedReleases

    const detail =
      node.releases.length === 0
        ? 'no releases'
        : `${node.releases.length} release(s) ` +
          `(${createdReleases} created, ${updatedReleases} updated)`
    console.log(
      `${created ? '+' : '='} project ${node.path}  ${detail}${logoStatus ? `, ${logoStatus}` : ''}`,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    stats.failures.push({ path: node.path, message })
    console.error(`! project ${node.path}  ${message}`)
  }
}

async function syncAvatar(resource, id, filePath, stats) {
  try {
    await uploadAvatar(resource, id, filePath)
    stats.avatarsUploaded += 1
    return 'logo uploaded'
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    stats.avatarFailures.push({ path: filePath, message })
    console.warn(`! avatar ${filePath}  ${message}`)
    return 'logo failed'
  }
}

async function seedGroup(node, parentId, stats, seedTime, depth) {
  const effectiveParentId = parentId ?? (await resolveParentId(node.path))
  const { group, created } = await ensureGroup(
    node.path,
    effectiveParentId,
    depth === 0 ? 'Fake GitLab projects for testing the Release Explorer.' : undefined,
  )
  stats.groupsCreated += created ? 1 : 0
  stats.groupsReused += created ? 0 : 1

  let logoStatus = ''
  if (node.logo) logoStatus = await syncAvatar('groups', group.id, node.logo, stats)

  console.log(
    `${created ? '+' : '='} group   ${group.full_path ?? node.path}${logoStatus ? `  ${logoStatus}` : ''}`,
  )

  for (const child of node.children) {
    if (child.type === 'group') {
      await seedGroup(child, group.id, stats, seedTime, depth + 1)
    } else {
      await seedProject(child, group.id, stats, seedTime)
    }
  }
}

async function main() {
  if (!VISIBILITIES.includes(visibility)) {
    throw new Error(`FAKE_GITLAB_VISIBILITY must be one of: ${VISIBILITIES.join(', ')}.`)
  }
  if (!existsSync(dataDir)) {
    throw new Error(`Fixture folder not found: ${dataDir}`)
  }

  const tree = scanGroup(dataDir, rootGroup)
  const totals = countTree(tree)

  console.log(`Fixture: ${relative(repoRoot, dataDir) || dataDir}`)
  console.log('')
  printPlan(tree)
  console.log('')
  console.log(`Target:  ${baseUrl}/${rootGroup}`)
  console.log(
    `Plan:    ${totals.groups} group(s), ${totals.projects} project(s), ` +
      `${totals.releases} release(s)`,
  )

  if (DRY_RUN) {
    console.log('\nDry run: no API calls were made.')
    return
  }

  if (!token) {
    throw new Error(
      'No token found. Add TOKEN=<personal access token with api scope> to .env ' +
        '(or export GITLAB_TOKEN).',
    )
  }

  console.log('')
  const seedTime = Date.now()
  const stats = {
    groupsCreated: 0,
    groupsReused: 0,
    projectsCreated: 0,
    projectsReused: 0,
    releasesCreated: 0,
    releasesUpdated: 0,
    avatarsUploaded: 0,
    avatarFailures: [],
    failures: [],
  }

  await seedGroup(tree, null, stats, seedTime, 0)

  console.log('')
  console.log('Summary')
  console.log(`  Groups:   ${stats.groupsCreated} created, ${stats.groupsReused} reused`)
  console.log(`  Projects: ${stats.projectsCreated} created, ${stats.projectsReused} reused`)
  console.log(`  Releases: ${stats.releasesCreated} created, ${stats.releasesUpdated} updated`)
  console.log(`  Avatars:  ${stats.avatarsUploaded} uploaded`)
  console.log(`  Open:     ${baseUrl}/${rootGroup}`)

  if (stats.avatarFailures.length > 0) {
    console.log('')
    console.error(`  Avatar failures: ${stats.avatarFailures.length}`)
    for (const failure of stats.avatarFailures) {
      console.error(`    - ${failure.path}: ${failure.message}`)
    }
    process.exitCode = 1
  }

  if (stats.failures.length > 0) {
    console.log('')
    console.error(`  Failures: ${stats.failures.length}`)
    for (const failure of stats.failures) {
      console.error(`    - ${failure.path}: ${failure.message}`)
    }
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})

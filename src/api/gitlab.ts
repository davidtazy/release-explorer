import { graphqlEndpoint } from '@/lib/auth'
import type {
  GroupInfo,
  GitLabUser,
  ProjectDetailCache,
  ProjectReleaseSummary,
  ReleaseInfo,
} from '@/types/gitlab'

/**
 * Read-only GitLab GraphQL client.
 *
 * Every fetch below is a single GraphQL operation. In particular, one request
 * returns every project of a group (and its subgroups) together with its most
 * recent release, so the table never does an N+1 fan-out per project.
 */

export interface GitLabContext {
  instanceUrl: string
  token: string
}

export class GitLabApiError extends Error {
  readonly status: number | undefined
  readonly sources: string[]

  constructor(message: string, status?: number, sources: string[] = []) {
    super(message)
    this.name = 'GitLabApiError'
    this.status = status
    this.sources = sources
  }
}

export const RELEASES_PER_PROJECT = 20
const MAX_PAGES = 50

const GROUPS_QUERY = /* GraphQL */ `
  query ReleaseExplorerGroups($after: String) {
    currentUser {
      id
      username
      name
      groups(first: 100, after: $after, sort: NAME_ASC) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          name
          fullPath
          webUrl
          parent {
            fullPath
          }
        }
      }
    }
  }
`

const GROUP_PROJECTS_QUERY = /* GraphQL */ `
  query ReleaseExplorerGroupProjects($fullPath: ID!, $after: String) {
    group(fullPath: $fullPath) {
      id
      name
      fullPath
      projects(first: 100, after: $after, includeSubgroups: true, includeArchived: false) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          name
          fullPath
          webUrl
          releases(first: 1, sort: RELEASED_AT_DESC) {
            nodes {
              tagName
              name
              releasedAt
              createdAt
            }
          }
        }
      }
    }
  }
`

const PROJECT_RELEASES_QUERY = /* GraphQL */ `
  query ReleaseExplorerProjectReleases($fullPath: ID!, $first: Int!) {
    project(fullPath: $fullPath) {
      id
      name
      fullPath
      webUrl
      releases(first: $first, sort: RELEASED_AT_DESC) {
        nodes {
          tagName
          name
          releasedAt
          createdAt
        }
      }
    }
  }
`

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface RawRelease {
  tagName: string
  name: string | null
  releasedAt: string | null
  createdAt: string | null
}

interface RawProject {
  id: string
  name: string
  fullPath: string
  webUrl: string | null
  releases: { nodes: RawRelease[] }
}

interface RawGroup {
  id: string
  name: string
  fullPath: string
  webUrl: string | null
  parent: { fullPath: string } | null
}

interface RawConnection<T> {
  pageInfo: PageInfo
  nodes: T[]
}

interface GroupsData {
  currentUser: {
    id: string
    username: string
    name: string
    groups: RawConnection<RawGroup>
  } | null
}

interface GroupProjectsData {
  group: {
    id: string
    name: string
    fullPath: string
    projects: RawConnection<RawProject>
  } | null
}

interface ProjectReleasesData {
  project: {
    id: string
    name: string
    fullPath: string
    webUrl: string | null
    releases: { nodes: RawRelease[] }
  } | null
}

interface GraphQlPayload<T> {
  data?: T
  errors?: { message: string }[]
}

async function graphqlRequest<T>(
  context: GitLabContext,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const endpoint = graphqlEndpoint(context.instanceUrl)
  let response: Response

  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.token}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new GitLabApiError(
      `Could not reach ${endpoint}. Check the URL, your network, and the CORS configuration of the GitLab instance.`,
    )
  }

  if (response.status === 401) {
    throw new GitLabApiError(
      'Authentication failed (401). Check that the token is valid and has the read_api scope.',
      401,
    )
  }

  if (!response.ok) {
    throw new GitLabApiError(`GitLab answered with HTTP ${response.status}.`, response.status)
  }

  let payload: GraphQlPayload<T>
  try {
    payload = (await response.json()) as GraphQlPayload<T>
  } catch {
    throw new GitLabApiError('GitLab returned a response that is not valid JSON.')
  }

  if (payload.errors?.length) {
    const messages = payload.errors.map((error) => error.message)
    throw new GitLabApiError(messages.join('; '), response.status, messages)
  }

  if (!payload.data) {
    throw new GitLabApiError('GitLab returned an empty response.')
  }

  return payload.data
}

function mapRelease(release: RawRelease): ReleaseInfo {
  return {
    tagName: release.tagName,
    name: release.name,
    releasedAt: release.releasedAt,
    createdAt: release.createdAt,
  }
}

function mapProject(project: RawProject): ProjectReleaseSummary {
  const latest = project.releases.nodes[0]

  return {
    id: project.id,
    name: project.name,
    fullPath: project.fullPath,
    webUrl: project.webUrl ?? '',
    latestRelease: latest ? mapRelease(latest) : null,
  }
}

function mapGroup(group: RawGroup): GroupInfo {
  return {
    id: group.id,
    name: group.name,
    fullPath: group.fullPath,
    webUrl: group.webUrl ?? '',
    parentPath: group.parent?.fullPath ?? null,
    visible: true,
  }
}

/** Groups the token owner has access to, including subgroups. */
export async function fetchGroups(
  context: GitLabContext,
): Promise<{ user: GitLabUser; groups: GroupInfo[] }> {
  const groups = new Map<string, GroupInfo>()
  let user: GitLabUser | null = null
  let after: string | null = null

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: GroupsData = await graphqlRequest<GroupsData>(context, GROUPS_QUERY, { after })

    if (!data.currentUser) {
      throw new GitLabApiError('Could not read the authenticated user.')
    }

    user = {
      id: data.currentUser.id,
      username: data.currentUser.username,
      name: data.currentUser.name,
    }

    for (const group of data.currentUser.groups.nodes) {
      groups.set(group.fullPath, mapGroup(group))
    }

    const pageInfo: PageInfo = data.currentUser.groups.pageInfo
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) break
    after = pageInfo.endCursor
  }

  if (!user) {
    throw new GitLabApiError('Could not read the authenticated user.')
  }

  return { user, groups: [...groups.values()] }
}

/** Every project (including subgroups) of one group with its latest release. */
export async function fetchGroupSnapshot(
  context: GitLabContext,
  groupPath: string,
): Promise<ProjectReleaseSummary[]> {
  const projects = new Map<string, ProjectReleaseSummary>()
  let after: string | null = null

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data: GroupProjectsData = await graphqlRequest<GroupProjectsData>(
      context,
      GROUP_PROJECTS_QUERY,
      {
        fullPath: groupPath,
        after,
      },
    )

    if (!data.group) {
      throw new GitLabApiError(`Group "${groupPath}" was not found or is not accessible.`)
    }

    for (const project of data.group.projects.nodes) {
      projects.set(project.fullPath, mapProject(project))
    }

    const pageInfo: PageInfo = data.group.projects.pageInfo
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) break
    after = pageInfo.endCursor
  }

  return [...projects.values()]
}

/** The most recent releases of a single project (used by the detail view). */
export async function fetchProjectDetails(
  context: GitLabContext,
  projectPath: string,
  first: number = RELEASES_PER_PROJECT,
): Promise<ProjectDetailCache> {
  const limit = Math.min(Math.max(Math.trunc(first), 1), 100)
  const data = await graphqlRequest<ProjectReleasesData>(context, PROJECT_RELEASES_QUERY, {
    fullPath: projectPath,
    first: limit,
  })

  if (!data.project) {
    throw new GitLabApiError(`Project "${projectPath}" was not found or is not accessible.`)
  }

  return {
    id: data.project.id,
    projectPath,
    fetchedAt: Date.now(),
    name: data.project.name,
    webUrl: data.project.webUrl ?? '',
    releases: data.project.releases.nodes.map(mapRelease),
  }
}

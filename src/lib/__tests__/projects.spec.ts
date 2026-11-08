import { describe, expect, it } from 'vitest'
import type { GroupInfo, ProjectReleaseSummary, ReleaseInfo } from '@/types/gitlab'
import {
  filterInvisibleProjects,
  groupPathsWithProjects,
  groupProjectsByParent,
  projectGroupPath,
} from '@/lib/projects'

const NOW = Date.parse('2026-06-15T12:00:00Z')
const DAY = 86_400_000

function release(tagName: string, daysAgo: number): ReleaseInfo {
  return {
    tagName,
    name: null,
    releasedAt: new Date(NOW - daysAgo * DAY).toISOString(),
    createdAt: null,
  }
}

function group(fullPath: string, name = fullPath.split('/').pop() ?? fullPath): GroupInfo {
  const segments = fullPath.split('/')
  return {
    id: fullPath,
    name,
    fullPath,
    webUrl: `https://gitlab.example/${fullPath}`,
    parentPath: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
    visible: true,
  }
}

/** A group record whose own projects are hidden from the main view. */
function hiddenGroup(fullPath: string): GroupInfo {
  return { ...group(fullPath), visible: false }
}

function project(
  fullPath: string,
  name = fullPath.split('/').pop() ?? fullPath,
  latestRelease: ReleaseInfo | null = null,
): ProjectReleaseSummary {
  return {
    id: fullPath,
    name,
    fullPath,
    webUrl: `https://gitlab.example/${fullPath}`,
    latestRelease,
  }
}

describe('projectGroupPath', () => {
  it('returns the immediate parent path', () => {
    expect(projectGroupPath('acme/platform/web-app')).toBe('acme/platform')
    expect(projectGroupPath('web-app')).toBe('')
  })
})

describe('groupProjectsByParent', () => {
  it('creates one bucket per immediate parent group', () => {
    const result = groupProjectsByParent(
      [
        project('acme/platform/web-app'),
        project('acme/platform/api-service'),
        project('acme/portal'),
      ],
      [group('acme/platform'), group('acme')],
    )

    expect(result.map((item) => item.path)).toEqual(['acme', 'acme/platform'])
    expect(result.map((item) => item.projects.map((entry) => entry.name))).toEqual([
      ['portal'],
      ['api-service', 'web-app'],
    ])
  })

  it('resolves display names from the group list', () => {
    const result = groupProjectsByParent(
      [project('acme/platform/core/legacy-tool')],
      [group('acme/platform/core', 'Core services')],
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.path).toBe('acme/platform/core')
    expect(result[0]?.name).toBe('Core services')
  })

  it('falls back to the last path segment for unknown groups', () => {
    const result = groupProjectsByParent([project('acme/tools/cli')], [])

    expect(result[0]?.name).toBe('tools')
  })

  it('sorts groups and projects by name by default', () => {
    const result = groupProjectsByParent(
      [
        project('acme/tools/zeta'),
        project('acme/tools/alpha'),
        project('acme/platform/web-app'),
      ],
      [],
    )

    expect(result.map((item) => item.path)).toEqual(['acme/platform', 'acme/tools'])
    expect(result[1]?.projects.map((entry) => entry.name)).toEqual(['alpha', 'zeta'])
  })

  it('sorts by latest release date, newest first, undated last', () => {
    const result = groupProjectsByParent(
      [
        project('acme/archive/old-tool', 'old-tool', release('v1.0.0', 500)),
        project('acme/archive/fresh-tool', 'fresh-tool', release('v2.0.0', 2)),
        project('acme/archive/no-release', 'no-release', null),
        project('acme/platform/web-app', 'web-app', release('v3.0.0', 20)),
      ],
      [],
      'date',
    )

    expect(result.map((item) => item.path)).toEqual(['acme/archive', 'acme/platform'])
    expect(result[0]?.projects.map((entry) => entry.name)).toEqual([
      'fresh-tool',
      'old-tool',
      'no-release',
    ])
  })

  it('does not mutate the input and returns no groups for no projects', () => {
    const input = [project('acme/beta'), project('acme/alpha')]
    const result = groupProjectsByParent(input, [])

    expect(result[0]?.projects.map((entry) => entry.name)).toEqual(['alpha', 'beta'])
    expect(input.map((entry) => entry.name)).toEqual(['beta', 'alpha'])
    expect(groupProjectsByParent([], [])).toEqual([])
  })
})

describe('groupPathsWithProjects', () => {
  it('returns only groups that directly contain a project', () => {
    const snapshots = {
      'acme': {
        projects: [project('acme/portal'), project('acme/platform/web-app')],
      },
      'acme/tools': {
        projects: [project('acme/tools/cli')],
      },
    }

    expect(groupPathsWithProjects(snapshots)).toEqual([
      'acme',
      'acme/platform',
      'acme/tools',
    ])
  })

  it('returns no groups without cached projects', () => {
    expect(groupPathsWithProjects({})).toEqual([])
  })
})

describe('filterInvisibleProjects', () => {
  it('drops only the hidden group’s own projects, keeping subgroup projects', () => {
    const projects = [
      project('acme/platform/web-app'),
      project('acme/platform/api-service'),
      project('acme/platform/core/legacy-tool'),
      project('acme/tools/cli'),
    ]

    const visible = filterInvisibleProjects(projects, [
      hiddenGroup('acme/platform'),
      group('acme/platform/core'),
      group('acme/tools'),
    ])

    expect(visible.map((entry) => entry.fullPath)).toEqual([
      'acme/platform/core/legacy-tool',
      'acme/tools/cli',
    ])
  })

  it('keeps projects whose group is unknown', () => {
    const projects = [project('acme/tools/cli')]

    expect(filterInvisibleProjects(projects, [])).toEqual(projects)
  })

  it('returns a copy when no group is hidden', () => {
    const projects = [project('acme/tools/cli')]
    const visible = filterInvisibleProjects(projects, [group('acme/tools')])

    expect(visible).toEqual(projects)
    expect(visible).not.toBe(projects)
  })
})

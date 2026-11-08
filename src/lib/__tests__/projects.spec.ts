import { describe, expect, it } from 'vitest'
import type { GroupInfo, ProjectReleaseSummary } from '@/types/gitlab'
import { groupProjectsByParent } from '@/lib/projects'

function group(fullPath: string, name = fullPath.split('/').pop() ?? fullPath): GroupInfo {
  const segments = fullPath.split('/')
  return {
    id: fullPath,
    name,
    fullPath,
    webUrl: `https://gitlab.example/${fullPath}`,
    parentPath: segments.length > 1 ? segments.slice(0, -1).join('/') : null,
  }
}

function project(fullPath: string, name = fullPath.split('/').pop() ?? fullPath) {
  return {
    id: fullPath,
    name,
    fullPath,
    webUrl: `https://gitlab.example/${fullPath}`,
    latestRelease: null,
  } satisfies ProjectReleaseSummary
}

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

  it('sorts groups by path and projects by name', () => {
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

  it('does not mutate the input and returns no groups for no projects', () => {
    const input = [project('acme/beta'), project('acme/alpha')]
    const result = groupProjectsByParent(input, [])

    expect(result[0]?.projects.map((entry) => entry.name)).toEqual(['alpha', 'beta'])
    expect(input.map((entry) => entry.name)).toEqual(['beta', 'alpha'])
    expect(groupProjectsByParent([], [])).toEqual([])
  })
})

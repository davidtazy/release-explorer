import { describe, expect, it } from 'vitest'
import type { GroupInfo } from '@/types/gitlab'
import {
  ancestorPaths,
  buildGroupTree,
  collectSubtreePaths,
  hasSelectedAncestor,
} from '@/lib/tree'

function group(fullPath: string, parentPath: string | null): GroupInfo {
  return {
    id: `gid://gitlab/Group/${fullPath}`,
    name: fullPath.split('/').pop() ?? fullPath,
    fullPath,
    webUrl: `https://gitlab.com/${fullPath}`,
    parentPath,
    visible: true,
  }
}

describe('buildGroupTree', () => {
  it('nests groups by parent path and sorts them by name', () => {
    const tree = buildGroupTree([
      group('zeta', null),
      group('zeta/child-b', 'zeta'),
      group('zeta/child-a', 'zeta'),
      group('alpha', null),
    ])

    expect(tree.map((node) => node.fullPath)).toEqual(['alpha', 'zeta'])
    expect(tree[1]?.children.map((node) => node.fullPath)).toEqual([
      'zeta/child-a',
      'zeta/child-b',
    ])
  })

  it('promotes groups whose parent is not accessible to roots', () => {
    const tree = buildGroupTree([group('hidden/child', 'hidden')])

    expect(tree).toHaveLength(1)
    expect(tree[0]?.fullPath).toBe('hidden/child')
    expect(tree[0]?.children).toEqual([])
  })
})

describe('ancestorPaths', () => {
  it('returns every ancestor from the root down', () => {
    expect(ancestorPaths('a/b/c')).toEqual(['a', 'a/b'])
    expect(ancestorPaths('root')).toEqual([])
  })
})

describe('hasSelectedAncestor', () => {
  it('detects selected ancestors only', () => {
    expect(hasSelectedAncestor('a/b/c', ['a/b'])).toBe(true)
    expect(hasSelectedAncestor('a/b/c', ['a'])).toBe(true)
    expect(hasSelectedAncestor('a/b/c', ['a/b/c'])).toBe(false)
    expect(hasSelectedAncestor('a/b/c', ['x'])).toBe(false)
  })
})

describe('collectSubtreePaths', () => {
  it('returns the node and all descendants', () => {
    const tree = buildGroupTree([
      group('root', null),
      group('root/a', 'root'),
      group('root/a/x', 'root/a'),
      group('root/b', 'root'),
    ])

    expect(collectSubtreePaths(tree[0]!)).toEqual([
      'root',
      'root/a',
      'root/a/x',
      'root/b',
    ])
  })
})

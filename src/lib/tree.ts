import type { GroupInfo } from '@/types/gitlab'

export interface GroupTreeNode extends GroupInfo {
  children: GroupTreeNode[]
}

/**
 * Turns the flat list returned by `currentUser.groups` into a forest.
 * Groups whose parent is not accessible are promoted to roots so nothing
 * disappears from the tree.
 */
export function buildGroupTree(groups: readonly GroupInfo[]): GroupTreeNode[] {
  const nodes = new Map<string, GroupTreeNode>()

  for (const group of groups) {
    nodes.set(group.fullPath, { ...group, children: [] })
  }

  const roots: GroupTreeNode[] = []

  for (const node of nodes.values()) {
    const parent = node.parentPath ? nodes.get(node.parentPath) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  sortNodes(roots)
  return roots
}

function sortNodes(nodes: GroupTreeNode[]): void {
  nodes.sort((left, right) => left.name.localeCompare(right.name))
  for (const node of nodes) sortNodes(node.children)
}

/** `a/b/c` -> `['a', 'a/b']` */
export function ancestorPaths(fullPath: string): string[] {
  const segments = fullPath.split('/')
  const ancestors: string[] = []

  for (let index = 1; index < segments.length; index += 1) {
    ancestors.push(segments.slice(0, index).join('/'))
  }

  return ancestors
}

export function hasSelectedAncestor(fullPath: string, selectedPaths: readonly string[]): boolean {
  const selected = new Set(selectedPaths)
  return ancestorPaths(fullPath).some((path) => selected.has(path))
}

/** All paths covered by selecting `node` (the node itself and every descendant). */
export function collectSubtreePaths(node: GroupTreeNode): string[] {
  const paths = [node.fullPath]
  for (const child of node.children) paths.push(...collectSubtreePaths(child))
  return paths
}

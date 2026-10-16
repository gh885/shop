import type { CategoryNode } from "@shop/api/sdk"

export interface LeafPath {
    id: string
    ids: string[]
    names: string[]
}

export const isLeaf = (node: CategoryNode): boolean => node.children.length === 0

// 只认 wire 的 id/name/children 三字段，不读其它契约字段（缩小漂移面）
export function flattenLeafPaths(
    nodes: CategoryNode[],
    ids: string[] = [],
    names: string[] = [],
): LeafPath[] {
    return nodes.flatMap((node) => {
        const nextIds = [...ids, node.id]
        const nextNames = [...names, node.name]
        return isLeaf(node)
            ? [{ id: node.id, ids: nextIds, names: nextNames }]
            : flattenLeafPaths(node.children, nextIds, nextNames)
    })
}

export function searchLeafPaths(paths: LeafPath[], keyword: string, limit = 60): LeafPath[] {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return []
    const hit = (name: string) => name.toLowerCase().includes(kw)
    const leafHit = (p: LeafPath) => (hit(p.names.at(-1) ?? "") ? 0 : 1)
    return paths
        .filter((p) => p.names.some(hit))
        .toSorted((a, b) => leafHit(a) - leafHit(b))
        .slice(0, limit)
}

export function columnsOf(tree: CategoryNode[], selectedIds: string[]): CategoryNode[][] {
    const columns: CategoryNode[][] = [tree]
    for (const id of selectedIds) {
        const current = columns.at(-1)?.find((n) => n.id === id)
        if (!current || isLeaf(current)) break
        columns.push(current.children)
    }
    return columns
}

// 选中路径 → 节点链（遇断链截断，容忍脏 URL 参数）
export function nodesOf(tree: CategoryNode[], selectedIds: string[]): CategoryNode[] {
    const chain: CategoryNode[] = []
    let level = tree
    for (const id of selectedIds) {
        const node = level.find((n) => n.id === id)
        if (!node) break
        chain.push(node)
        level = node.children
    }
    return chain
}

export function selectedLeafId(tree: CategoryNode[], selectedIds: string[]): string | undefined {
    const chain = nodesOf(tree, selectedIds)
    const last = chain.at(-1)
    return last && isLeaf(last) ? last.id : undefined
}

export function selectAt(selectedIds: string[], column: number, id: string): string[] {
    return [...selectedIds.slice(0, column), id]
}

export function filterByName(nodes: CategoryNode[], keyword: string): CategoryNode[] {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return nodes
    return nodes.filter((n) => n.name.toLowerCase().includes(kw))
}

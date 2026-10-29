import type { CategoryTreeNode } from "@shop/api/sdk"

export type CategoryPath = {
    id: string
    /** 从根到当前节点的 id 链。 */
    ids: string[]
    names: string[]
    mountable: boolean
}

/** 所有可挂商品的叶子。搜索与"选中路径"都用它。 */
export function mountableLeaves(nodes: CategoryTreeNode[]): CategoryPath[] {
    const out: CategoryPath[] = []
    const walk = (level: CategoryTreeNode[], parentIds: string[], parentNames: string[]) => {
        for (const node of level) {
            const ids = [...parentIds, node.id]
            const names = [...parentNames, node.name]
            if (node.mountable) {
                out.push({ id: node.id, ids, names, mountable: true })
            }
            walk(node.children, ids, names)
        }
    }
    walk(nodes, [], [])
    return out
}

/** 按 id 找路径。找不到返回 undefined。 */
export function findCategoryPath(nodes: CategoryTreeNode[], id: string): CategoryPath | undefined {
    const walk = (
        level: CategoryTreeNode[],
        parentIds: string[],
        parentNames: string[],
    ): CategoryPath | undefined => {
        for (const node of level) {
            const ids = [...parentIds, node.id]
            const names = [...parentNames, node.name]
            if (node.id === id) {
                return { id: node.id, ids, names, mountable: node.mountable }
            }
            const found = walk(node.children, ids, names)
            if (found !== undefined) return found
        }
        return undefined
    }
    return walk(nodes, [], [])
}

/** 三列级联：按已选 id 逐层取子节点。 */
export function columnsOf(nodes: CategoryTreeNode[], selectedIds: string[]): CategoryTreeNode[][] {
    const columns: CategoryTreeNode[][] = [nodes]
    let level = nodes
    for (const id of selectedIds) {
        const current = level.find((node) => node.id === id)
        if (current === undefined || current.children.length === 0) break
        level = current.children
        columns.push(level)
    }
    return columns
}

/** 点某列的一项：截断该列之后的已选路径。 */
export function selectAt(selectedIds: string[], column: number, id: string): string[] {
    return [...selectedIds.slice(0, column), id]
}

export function filterByName(nodes: CategoryTreeNode[], keyword: string): CategoryTreeNode[] {
    const trimmed = keyword.trim().toLowerCase()
    if (trimmed === "") return nodes
    return nodes.filter((node) => node.name.toLowerCase().includes(trimmed))
}

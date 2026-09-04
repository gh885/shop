import type { CategoryNodeResponse } from "@shop/api/sdk"

/**
 * category —— 类目选择的纯逻辑（树 → 视图读模型）。不碰 React / 网络。
 *
 * 类目树全量返回且长期缓存（见 queries），所以「搜索」「级联」「路径回填」
 * 全在前端这份树上算，不额外开接口：
 * - flattenLeafPaths ：树 → 末级路径清单（搜索的语料）
 * - searchLeafPaths  ：关键词 → 候选末级类目（末级名命中排前）
 * - columnsOf        ：选中路径 → 级联列（千牛式三列）
 * - nodesOf          ：选中路径 → 节点链（面包屑与「是否末级」都由它推）
 */

/** 一条末级类目路径：id = 末级 id，ids/names 为根 → 末级 */
export interface LeafPath {
    id: string
    ids: string[]
    names: string[]
}

/** 末级判定：商品只能挂末级类目 */
export const isLeaf = (node: CategoryNodeResponse): boolean => (node.children?.length ?? 0) === 0

/** 树 → 末级路径清单（搜索语料，整棵树拍平一次即可） */
export function flattenLeafPaths(
    nodes: CategoryNodeResponse[],
    ids: string[] = [],
    names: string[] = [],
): LeafPath[] {
    return nodes.flatMap((node) => {
        const nextIds = [...ids, node.id]
        const nextNames = [...names, node.name]
        return isLeaf(node)
            ? [{ id: node.id, ids: nextIds, names: nextNames }]
            : flattenLeafPaths(node.children ?? [], nextIds, nextNames)
    })
}

/** 关键词搜类目：路径任一级命中即算候选，末级名命中的排前面（更接近卖家想发的那个） */
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

/** 选中路径 → 级联列：第 0 列是根，之后每列是上一列选中项的子级（无子级则不再出列） */
export function columnsOf(
    tree: CategoryNodeResponse[],
    selectedIds: string[],
): CategoryNodeResponse[][] {
    const columns: CategoryNodeResponse[][] = [tree]
    for (const id of selectedIds) {
        const current = columns.at(-1)?.find((n) => n.id === id)
        if (!current || isLeaf(current)) break
        columns.push(current.children ?? [])
    }
    return columns
}

/** 选中路径 → 节点链（遇到断链就截断，容忍脏 URL 参数） */
export function nodesOf(
    tree: CategoryNodeResponse[],
    selectedIds: string[],
): CategoryNodeResponse[] {
    const chain: CategoryNodeResponse[] = []
    let level = tree
    for (const id of selectedIds) {
        const node = level.find((n) => n.id === id)
        if (!node) break
        chain.push(node)
        level = node.children ?? []
    }
    return chain
}

/** 已选到末级才算选完（可进下一步） */
export function selectedLeafId(
    tree: CategoryNodeResponse[],
    selectedIds: string[],
): string | undefined {
    const chain = nodesOf(tree, selectedIds)
    const last = chain.at(-1)
    return last && isLeaf(last) ? last.id : undefined
}

/** 点第 column 列的某项：截断其后的选择 */
export function selectAt(selectedIds: string[], column: number, id: string): string[] {
    return [...selectedIds.slice(0, column), id]
}

/** 列内按名称过滤（列顶部的小搜索框） */
export function filterByName(
    nodes: CategoryNodeResponse[],
    keyword: string,
): CategoryNodeResponse[] {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return nodes
    return nodes.filter((n) => n.name.toLowerCase().includes(kw))
}

import type { CategoryTreeNode } from "@shop/api/sdk"

import { CATEGORY_MAX_LEVEL } from "./constants"

// headless-tree 的 rootItemId 必须存在，而类目树是多根的：合成一个不渲染的根挂在所有一级类目之上
export const CATEGORY_ROOT_ID = "__category_root__"

export interface CategoryIndex {
    byId: Readonly<Record<string, CategoryTreeNode>>
    // 父 id → 子 id 序列（含合成根），顺序即后端给的顺序（sort 升序 + 创建时间）
    childIds: Readonly<Record<string, readonly string[]>>
}

export function indexCategoryTree(nodes: readonly CategoryTreeNode[]): CategoryIndex {
    const byId: Record<string, CategoryTreeNode> = {}
    const childIds: Record<string, readonly string[]> = {}

    const walk = (list: readonly CategoryTreeNode[]): string[] =>
        list.map((node) => {
            const id = node.id
            byId[id] = node
            childIds[id] = walk(node.children)
            return id
        })

    childIds[CATEGORY_ROOT_ID] = walk(nodes)
    return { byId, childIds }
}

// 一级类目的父级是合成根；后端给的一级 parentId 是 null（根没有父），不能直接当父 id 用
export function parentIdOf(index: CategoryIndex, id: string): string {
    const node = index.byId[id]
    return node && node.level > 1 && node.parentId !== null ? node.parentId : CATEGORY_ROOT_ID
}

// 越界原样返回同一个引用：调用点靠 === 判断「没动」，不发空请求
export function moveWithinSiblings(
    ids: readonly string[],
    index: number,
    delta: -1 | 1,
): readonly string[] {
    const to = index + delta
    if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return ids
    const next = [...ids]
    const moved = next.splice(index, 1)[0]
    if (moved === undefined) return ids
    next.splice(to, 0, moved)
    return next
}

/** 重排只需要 id 与新的 sort：新契约 `UpdateSortRequest` 就这两格 */
export interface CategorySortUpdate {
    id: string
    sort: number
}

export function orderUpdates(
    orderedIds: readonly string[],
    byId: Readonly<Record<string, CategoryTreeNode>>,
): CategorySortUpdate[] {
    const updates: CategorySortUpdate[] = []
    orderedIds.forEach((id, position) => {
        const node = byId[id]
        if (!node) return
        const sort = (position + 1) * 10
        if (node.sort !== sort) updates.push({ id, sort })
    })
    return updates
}

// 排末尾：与 orderUpdates 同套 10 的步长，别用 sort=0 让新节点跳到最前
export function appendSort(index: CategoryIndex, parentId: string): number {
    return ((index.childIds[parentId]?.length ?? 0) + 1) * 10
}

export function canNestUnder(level: number): boolean {
    return level < CATEGORY_MAX_LEVEL
}

export function isLeafCategory(level: number): boolean {
    return level === CATEGORY_MAX_LEVEL
}

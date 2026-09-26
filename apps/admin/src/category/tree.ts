import type { CategoryNode } from "@shop/api/sdk"

/**
 * 类目树的纯形状变换（无 React、无请求）——树组件与页面共用。
 *
 * 为什么要一份索引：树上每个节点都要「取自己、取子项、取父级」，直接递归 find 是 O(树) × N；
 * 索引一次成表后这些都是 O(1)，也让同级排序、拖拽落点这些计算可以单独测。
 */

/** headless-tree 的 `rootItemId` 必须存在，而类目树是多根的：合成一个不渲染的根挂在所有一级类目之上 */
export const CATEGORY_ROOT_ID = "__category_root__"

export interface CategoryIndex {
    byId: Readonly<Record<string, CategoryNode>>
    /** 父 id → 子 id 序列（含合成根），顺序即后端给的顺序（sort 升序 + 创建时间） */
    childIds: Readonly<Record<string, readonly string[]>>
}

/** 拍平成索引；`childIds[CATEGORY_ROOT_ID]` 就是一级类目 */
export function indexCategoryTree(nodes: readonly CategoryNode[]): CategoryIndex {
    const byId: Record<string, CategoryNode> = {}
    const childIds: Record<string, readonly string[]> = {}

    const walk = (list: readonly CategoryNode[]): string[] =>
        list.map((node) => {
            byId[node.id] = node
            childIds[node.id] = walk(node.children)
            return node.id
        })

    childIds[CATEGORY_ROOT_ID] = walk(nodes)
    return { byId, childIds }
}

/** 节点所在父级（一级类目的父级是合成根；后端给的一级 parentId 是零 UUID 占位） */
export function parentIdOf(index: CategoryIndex, id: string): string {
    const node = index.byId[id]
    return node && node.level > 1 ? node.parentId : CATEGORY_ROOT_ID
}

/** 同级顺序里把某一项挪一格；越界原样返回（调用点可直接比对引用判断「没动」） */
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

/** 同级排序的落库形状：PUT /admin/categories/{id} 要求 name 必填，所以带上原值一起交 */
export interface CategorySortUpdate {
    id: string
    name: string
    iconUrl: string | null
    sort: number
}

/**
 * 把「新的同级顺序」折成要落库的更新：sort 按 10 / 20 / 30… 重排，只交出**真的变了**的那些。
 *
 * 用固定步长而不是相邻交换，是为了让「拖到中间」也只改必要的行列：相邻互换恰好只动两行，
 * 整表重排时每行都是 10 的倍数，后续再插空也不会撞值。
 */
export function orderUpdates(
    orderedIds: readonly string[],
    byId: Readonly<Record<string, CategoryNode>>,
): CategorySortUpdate[] {
    const updates: CategorySortUpdate[] = []
    orderedIds.forEach((id, position) => {
        const node = byId[id]
        if (!node) return
        const sort = (position + 1) * 10
        if (node.sort !== sort) {
            updates.push({ id, name: node.name, iconUrl: node.iconUrl, sort })
        }
    })
    return updates
}

/** 新建子类目时排在末尾：与 {@link orderUpdates} 同一套步长，避免新节点因 sort=0 跳到最前 */
export function appendSort(index: CategoryIndex, parentId: string): number {
    return ((index.childIds[parentId]?.length ?? 0) + 1) * 10
}

import type { CategoryNodeResponse } from "@shop/api/sdk"

/**
 * category —— 类目树领域层（纯类型 + wire → 投影）。
 * 类目树全量返回且长期缓存，前端这份树上做「搜索/级联/路径回填」。
 */

/** 类目树节点：递归引用自身。parentId/sort/iconUrl 可空（根节点无 parent），children 空数组兜底 */
export type CategoryNode = {
    id: string
    parentId: string | null
    name: string
    level: number
    sort: number | null
    status: "DISABLED" | "ENABLED"
    iconUrl: string | null
    children: CategoryNode[]
}

/** wire → 领域形状：单个节点递归投影，children 空数组兜底 */
export function toCategoryNode(dto: CategoryNodeResponse): CategoryNode {
    return {
        id: dto.id ?? "",
        parentId: dto.parentId ?? null,
        name: dto.name ?? "",
        level: dto.level ?? 0,
        sort: dto.sort ?? null,
        status: dto.status ?? "DISABLED",
        iconUrl: dto.iconUrl ?? null,
        children: (dto.children ?? []).map(toCategoryNode),
    }
}

/** wire → 领域形状：树整体递归投影 */
export function toCategoryTree(nodes: CategoryNodeResponse[]): CategoryNode[] {
    return nodes.map(toCategoryNode)
}

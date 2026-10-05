import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

import { PRODUCT_SORT_VALUES, type ProductSort } from "#/products"

/** 搜索页每页固定 24 条（与后端 PageParams 上限解耦，页面自己决定一次看多少）。 */
export const SEARCH_PAGE_SIZE = 24

/**
 * 排序词表取商品域的 {@link PRODUCT_SORT_VALUES}（同一个 wire 概念 `ProductQuery.sort`）。
 * 此前这里另抄了一份同形的三值数组，两份各改各的，症状是「URL 上带着的排序被解析层丢掉」。
 */
export type SearchParams = {
    q?: string
    categoryId?: string
    sort?: ProductSort
    page?: number
}

/** validateSearch 入参：带 SearchSchemaInput 标记，允许其它页面不带 search 裸链到 /search。 */
export type SearchParamsInput = SearchSchemaInput & {
    q?: unknown
    categoryId?: unknown
    sort?: unknown
    page?: unknown
}

const optionalTrimmedString = (max: number) =>
    z
        .string()
        .trim()
        .max(max)
        // 脏 URL 不把搜索页打成错误页：过长/非字符串查询词退化成「没有关键词」。
        .optional()
        .catch(undefined)

const searchParamsSchema = z.object({
    q: optionalTrimmedString(128),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，不是 Promise.catch
    categoryId: z.string().uuid().optional().catch(undefined),
    // 阶段 A 页面只暴露默认排序；解析层仍认全量词表，旧链接带的价格排序值不会被打错
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- 同上
    sort: z.enum(PRODUCT_SORT_VALUES).optional().catch(undefined),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- 同上
    page: z.coerce.number<number>().int().min(1).optional().catch(undefined),
})

/** 解析并归一 URL 查询参数；所有脏值收敛为 undefined，而不是抛错。 */
export function parseSearchParams(search: SearchParamsInput): SearchParams {
    return cleanSearch(searchParamsSchema.parse(search))
}

/** 是否具备真正向后端发查询的条件：空关键词 + 无类目只提示输入，不请求全站列表。 */
export function hasSearchCriteria(search: Pick<SearchParams, "q" | "categoryId">): boolean {
    return Boolean(search.q?.trim() || search.categoryId)
}

/** 删除空值、默认排序和第 1 页参数，保持分享 URL 干净。 */
export function cleanSearch(search: SearchParams): SearchParams {
    const q = search.q?.trim()
    const categoryId = search.categoryId?.trim()
    return {
        ...(q ? { q } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(search.sort && search.sort !== "newest" ? { sort: search.sort } : {}),
        ...(search.page && search.page > 1 ? { page: search.page } : {}),
    }
}

/** query key 只吃归一后的条件，避免 `?page=1` 与 `?` 产生两份等价缓存。 */
export function searchQueryKey(search: SearchParams) {
    const normalized = cleanSearch(search)
    return {
        q: normalized.q,
        categoryId: normalized.categoryId,
        sort: normalized.sort ?? "newest",
        page: normalized.page ?? 1,
    } as const
}

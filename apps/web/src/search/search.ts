import { z } from "zod"

import type { SearchSchemaInput } from "@tanstack/react-router"

import { PRODUCT_SORT_VALUES, type ProductSort } from "#/products"

export const SEARCH_PAGE_SIZE = 24

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
    z.string().trim().max(max).optional().catch(undefined)

const searchParamsSchema = z.object({
    q: optionalTrimmedString(128),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- zod 的 .catch() 是解析兜底，不是 Promise.catch
    categoryId: z.string().uuid().optional().catch(undefined),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- 同上
    sort: z.enum(PRODUCT_SORT_VALUES).optional().catch(undefined),
    // oxlint-disable-next-line unicorn/prefer-top-level-await -- 同上
    page: z.coerce.number<number>().int().min(1).optional().catch(undefined),
})

export function parseSearchParams(search: SearchParamsInput): SearchParams {
    return cleanSearch(searchParamsSchema.parse(search))
}

export function hasSearchCriteria(search: Pick<SearchParams, "q" | "categoryId">): boolean {
    return Boolean(search.q?.trim() || search.categoryId)
}

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

export function searchQueryKey(search: SearchParams) {
    const normalized = cleanSearch(search)
    return {
        q: normalized.q,
        categoryId: normalized.categoryId,
        sort: normalized.sort ?? "newest",
        page: normalized.page ?? 1,
    } as const
}

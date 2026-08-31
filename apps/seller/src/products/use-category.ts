import { useMemo } from "react"
import { queryOptions, useQuery } from "@tanstack/react-query"

import { productApi } from "#/shared/lib/api"

import { flattenLeafPaths, type LeafPath } from "./category"

/**
 * use-category —— 类目树的 React 接线层。
 * 类目是低频变更的公共数据：全量拉一次，长缓存，页面内的搜索/级联都在这份树上算。
 */

const categoryTreeOptions = queryOptions({
    queryKey: ["categories", "tree"],
    queryFn: () => productApi.categoryTree(),
    staleTime: 10 * 60_000,
})

export function useCategoryTree() {
    return useQuery(categoryTreeOptions)
}

/** 末级路径清单（搜索语料）：树没变就不重算 */
export function useLeafPaths(): LeafPath[] {
    const { data } = useCategoryTree()
    return useMemo(() => flattenLeafPaths(data ?? []), [data])
}

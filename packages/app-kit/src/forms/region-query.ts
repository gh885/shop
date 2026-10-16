import { queryOptions } from "@tanstack/react-query"

import { loadRegionCascaderTree } from "@shop/common/domain"

/** 区划整树单一 query 定义：三个消费点共用同一 key + staleTime Infinity，全会话只取一次；失败由调用点各自 throwOnError:false 就地退化 */
export const regionCascaderTreeOptions = queryOptions({
    queryKey: ["region-cascader-tree"],
    queryFn: loadRegionCascaderTree,
    staleTime: Infinity,
})

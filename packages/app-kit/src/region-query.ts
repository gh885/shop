import { queryOptions } from "@tanstack/react-query"

import { loadRegionCascaderTree } from "@shop/common"

/**
 * 国标区划整树（级联选择器的数据源）—— 单一 query 定义。
 *
 * 三个消费点（app-kit 的 RegionField、seller 运费模板的多选）共用同一个 key，
 * 所以任一处取过，其余直接命中缓存；随包懒加载的静态 JSON，`staleTime: Infinity`
 * 全会话只取一次。失败由调用点各自 `throwOnError: false` 就地退化，不抛给边界。
 */
export const regionCascaderTreeOptions = queryOptions({
    queryKey: ["region-cascader-tree"],
    queryFn: loadRegionCascaderTree,
    staleTime: Infinity,
})

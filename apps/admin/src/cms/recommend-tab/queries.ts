import { CmsAdminApi } from "@shop/api/sdk"
import type { CmsStatus, RecommendTabRequest } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

// 推荐条域 queryKey 工厂 + 取数 + 写操作
const tabKeys = {
    all: ["admin", "cms", "recommend-tabs"] as const,
    list: () => ["admin", "cms", "recommend-tabs", "list"] as const,
}

/** 词条列表：后端不分页、无筛选参数，按 sortOrder 返回全量 */
export const tabListOptions = () =>
    queryOptions({
        queryKey: tabKeys.list(),
        queryFn: () => CmsAdminApi.listAdminRecommendTabs(),
    })

export function useCreateTab() {
    return useMutation({
        mutationFn: (input: RecommendTabRequest) => CmsAdminApi.createTab({ body: input }),
        meta: { success: "词条已创建", error: "词条保存失败", invalidates: [tabKeys.all] },
    })
}

export function useUpdateTab() {
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: RecommendTabRequest }) =>
            CmsAdminApi.updateTab({ path: { id }, body: input }),
        meta: { success: "词条已更新", error: "词条保存失败", invalidates: [tabKeys.all] },
    })
}

export function useSetTabStatus() {
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: CmsStatus }) =>
            CmsAdminApi.setTabStatus({ path: { id, status } }),
        meta: { success: "词条状态已更新", error: "词条状态更新失败", invalidates: [tabKeys.all] },
    })
}

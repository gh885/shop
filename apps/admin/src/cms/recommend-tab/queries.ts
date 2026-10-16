import { message } from "#/locales/message"
import { CmsAdminApi } from "@shop/api/sdk"
import type { CmsStatus, RecommendTabRequest } from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

const tabKeys = {
    all: ["admin", "cms", "recommend-tabs"] as const,
    list: () => ["admin", "cms", "recommend-tabs", "list"] as const,
}

export const tabListOptions = () =>
    queryOptions({
        queryKey: tabKeys.list(),
        queryFn: () => CmsAdminApi.listAdminRecommendTabs(),
    })

export function useCreateTab() {
    return useMutation({
        mutationFn: (input: RecommendTabRequest) => CmsAdminApi.createTab({ body: input }),
        meta: {
            success: message("cms.tab.created"),
            error: message("cms.tab.failed"),
            invalidates: [tabKeys.all],
        },
    })
}

export function useUpdateTab() {
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: RecommendTabRequest }) =>
            CmsAdminApi.updateTab({ path: { id }, body: input }),
        meta: {
            success: message("cms.tab.updated"),
            error: message("cms.tab.failed"),
            invalidates: [tabKeys.all],
        },
    })
}

export function useSetTabStatus() {
    return useMutation({
        mutationFn: ({ id, status }: { id: string; status: CmsStatus }) =>
            CmsAdminApi.setTabStatus({ path: { id, status } }),
        meta: {
            success: message("cms.tab.statusUpdated"),
            error: message("cms.tab.statusFailed"),
            invalidates: [tabKeys.all],
        },
    })
}

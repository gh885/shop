import { AdminLogisticsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

/** 物流异常单列表的 key（这个列表不分页：它是「一眼看得过来的待办」，口径见 LOG-33） */
export const logisticsKeys = {
    openIssues: ["admin", "logistics", "open-issues"] as const,
}

export const openIssuesOptions = () =>
    queryOptions({
        queryKey: logisticsKeys.openIssues,
        queryFn: async () => {
            const issues = await AdminLogisticsApi.listOpenIssues()
            return issues
        },
    })

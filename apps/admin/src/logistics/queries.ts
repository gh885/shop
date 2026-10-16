import { AdminLogisticsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

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

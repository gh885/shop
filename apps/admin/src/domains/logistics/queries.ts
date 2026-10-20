import { AdminLogisticsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

const logisticsAll = ["logistics"] as const

export const logisticsKeys = {
    all: logisticsAll,
    openIssues: [...logisticsAll, "open-issues"] as const,
}

export const openIssuesOptions = () =>
    queryOptions({
        queryKey: logisticsKeys.openIssues,
        queryFn: async () => {
            const issues = await AdminLogisticsApi.listOpenIssues()
            return issues
        },
    })

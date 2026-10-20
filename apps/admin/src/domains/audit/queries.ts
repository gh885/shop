import { AdminAuditsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import type { AuditSearch } from "./search"

export const auditKeys = {
    all: ["audits"] as const,
    list: (input: AuditSearch) => [...auditKeys.all, input] as const,
}

// 列表与导出共用这一份筛选参数：两处各写一遍就会「导出的和看到的不一样」
export const auditFilterParams = (input: AuditSearch) => ({
    operatorId: input.operatorId,
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    from: input.from,
    to: input.to,
})

// 时间窗原样透传：后端判的是闭开区间 [from, to)，这里不做任何加减（含当天得由选择器自己把终点推到当天末尾）
export const auditListOptions = (input: AuditSearch) =>
    queryOptions({
        queryKey: auditKeys.list(input),
        queryFn: async ({ signal }) => {
            const result = await AdminAuditsApi.listAuditRecords({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: auditFilterParams(input),
                },
                signal,
            })
            return { records: result.records, total: result.total }
        },
        placeholderData: (previous) => previous,
    })

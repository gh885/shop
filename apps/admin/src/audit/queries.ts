import { AdminAuditsApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

/** 审计查询输入：URL search 的形状（page/size 由分页 schema 给默认值） */
export type AuditSearch = {
    operatorId?: string
    targetType?: string
    targetId?: string
    action?: string
    /** 时间窗起点（ISO），与 to 一起构成闭开区间 */
    from?: string
    to?: string
    page: number
    size: number
}

/** 审计 key 工厂：list 是参数化切片，all 一发命中所有筛选（未来的导出复用同一组参数） */
export const auditKeys = {
    all: ["admin", "audits"] as const,
    list: (input: AuditSearch) =>
        [
            "admin",
            "audits",
            input.operatorId ?? "",
            input.targetType ?? "",
            input.targetId ?? "",
            input.action ?? "",
            input.from ?? "",
            input.to ?? "",
            input.page,
            input.size,
        ] as const,
}

/**
 * 审计列表取数：参数即 key 的一部分，出参只裁 records/total。
 *
 * 时间窗原样透传：后端判的是闭开区间 `[from, to)`，而页面上的时间选择器给的是
 * 「那一刻」的精确时刻（不按分钟截断），所以这里不做任何加减——真要「含当天」
 * 得由选择器自己把终点推到当天末尾。
 */
export const auditListOptions = (input: AuditSearch) =>
    queryOptions({
        queryKey: auditKeys.list(input),
        queryFn: async () => {
            const result = await AdminAuditsApi.listAuditRecords({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: {
                        operatorId: input.operatorId,
                        targetType: input.targetType,
                        targetId: input.targetId,
                        action: input.action,
                        from: input.from,
                        to: input.to,
                    },
                },
            })
            return { records: result.records, total: result.total }
        },
        placeholderData: (previous) => previous,
    })

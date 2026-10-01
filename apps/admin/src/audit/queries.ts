import { AdminAuditsApi } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"
import {
    AUDIT_ACTION_MAX,
    AUDIT_PAGE_SIZE,
    AUDIT_TARGET_ID_MAX,
    AUDIT_TARGET_TYPE_MAX,
} from "./constants"

/** 审计查询输入：URL search 的形状（page/size 由分页 schema 给默认值） */
export const auditSearchSchema = createPaginationSearchSchema(AUDIT_PAGE_SIZE).extend({
    operatorId: z.string().uuid().optional(),
    targetType: z.string().max(AUDIT_TARGET_TYPE_MAX).optional(),
    targetId: z.string().max(AUDIT_TARGET_ID_MAX).optional(),
    action: z.string().max(AUDIT_ACTION_MAX).optional(),
    /** 时间窗起点（ISO），与 to 一起构成闭开区间 */
    from: z.string().optional(),
    to: z.string().optional(),
})
export type AuditSearch = z.infer<typeof auditSearchSchema>

/** 审计 key 工厂：list 是参数化切片，all 一发命中所有筛选（未来的导出复用同一组参数） */
export const auditKeys = {
    all: ["admin", "audits"] as const,
    list: (input: AuditSearch) => [...auditKeys.all, input] as const,
}

/**
 * 列表与导出共用的筛选参数（两处各写一遍就会「导出的和看到的不一样」）：
 * 时间窗原样透传，后端判的是闭开区间 `[from, to)`。
 */
export const auditFilterParams = (input: AuditSearch) => ({
    operatorId: input.operatorId,
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    from: input.from,
    to: input.to,
})

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
                    query: auditFilterParams(input),
                },
            })
            return { records: result.records, total: result.total }
        },
        placeholderData: (previous) => previous,
    })

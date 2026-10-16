import { AdminRumApi, type AdminRumIssueItem } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"
import {
    RUM_APP_MAX,
    RUM_EVENT_PAGE_SIZE,
    RUM_FINGERPRINT_MAX,
    RUM_ISSUE_PAGE_SIZE,
    RUM_KIND_MAX,
    RUM_ROUTE_MAX,
} from "./constants"

/**
 * 问题列表的 URL search。
 *
 * `app` / `kind` 只挡长度不挡取值：取值合法性在后端（名单外的值给 400 而不是静默返空页），
 * 前端这一层再做一遍枚举校验，只会让「后端加了新端」时前端先拦下来——而那时恰恰是要看它的。
 */
export const rumIssueSearchSchema = createPaginationSearchSchema(RUM_ISSUE_PAGE_SIZE).extend({
    app: z.string().max(RUM_APP_MAX).optional(),
    kind: z.string().max(RUM_KIND_MAX).optional(),
    /** 时间窗起点（ISO），与 to 一起构成闭开区间 */
    from: z.string().optional(),
    to: z.string().optional(),
})
export type RumIssueSearch = z.infer<typeof rumIssueSearchSchema>

/** 明细列表的 URL search：比问题列表多一个指纹（从问题列表点进来时带上）与路由筛 */
export const rumEventSearchSchema = createPaginationSearchSchema(RUM_EVENT_PAGE_SIZE).extend({
    fingerprint: z.string().max(RUM_FINGERPRINT_MAX).optional(),
    app: z.string().max(RUM_APP_MAX).optional(),
    kind: z.string().max(RUM_KIND_MAX).optional(),
    route: z.string().max(RUM_ROUTE_MAX).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
})
export type RumEventSearch = z.infer<typeof rumEventSearchSchema>

/**
 * 问题列表的一行 = 端点出参 + 一个定位 id。
 *
 * 合成一个类型而不是让调用点各自 `AdminRumIssueItem & { id: string }`：
 * 外壳泛型要的正是这个形状，写第二遍就会有一处漏掉 id。
 */
export type RumIssueRow = AdminRumIssueItem & { id: string }

/** 遥测 key 工厂：issues / events 各自参数化，detail 按 id */
export const rumKeys = {
    all: ["admin", "rum"] as const,
    issues: (input: RumIssueSearch) => [...rumKeys.all, "issues", input] as const,
    events: (input: RumEventSearch) => [...rumKeys.all, "events", input] as const,
    detail: (id: string) => [...rumKeys.all, "detail", id] as const,
}

/**
 * 问题列表取数：参数即 key 的一部分，出参裁成 records/total。
 *
 * 时间窗原样透传：后端判的是闭开区间 `[from, to)`，而时间选择器给的是「那一刻」，
 * 所以这里不做任何加减——真要「含当天」得由选择器自己把终点推到当天末尾。
 * 不给时间窗时后端默认看最近 24 小时（且只给下界，理由见后端 `RumQueryService.window`）。
 */
export const rumIssueListOptions = (input: RumIssueSearch) =>
    queryOptions({
        queryKey: rumKeys.issues(input),
        queryFn: async () => {
            const result = await AdminRumApi.listRumIssues({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: { app: input.app, kind: input.kind, from: input.from, to: input.to },
                },
            })
            return {
                // 一个「问题」是聚合出来的，端点出参里本来就没有主键；而列表外壳要求每行有唯一 id
                // （同一个指纹落在两个端上是两个问题），所以定位键是这三者拼起来的，与后端的分组键一致。
                records: result.records.map((issue): RumIssueRow => ({
                    ...issue,
                    id: `${issue.fingerprint}|${issue.app}|${issue.kind}`,
                })),
                total: result.total,
            }
        },
        placeholderData: (previous) => previous,
    })

/** 明细列表取数：点进一个问题之后看到的就是它 */
export const rumEventListOptions = (input: RumEventSearch) =>
    queryOptions({
        queryKey: rumKeys.events(input),
        queryFn: async () => {
            const result = await AdminRumApi.listRumEvents({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: {
                        fingerprint: input.fingerprint,
                        app: input.app,
                        kind: input.kind,
                        route: input.route,
                        from: input.from,
                        to: input.to,
                    },
                },
            })
            return { records: result.records, total: result.total }
        },
        placeholderData: (previous) => previous,
    })

/**
 * 单条原件。
 *
 * **只在抽屉真的打开时才挂载**（body 组件由抽屉的开关决定生死）：列表一页 50 条，
 * 每条都预先拉一份几 KB 的堆栈是白花的流量与内存，而人一次只看一条。
 */
export const rumEventDetailOptions = (id: string) =>
    queryOptions({
        queryKey: rumKeys.detail(id),
        queryFn: async () => await AdminRumApi.getRumEventDetail({ path: { id } }),
    })

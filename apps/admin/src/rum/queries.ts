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

// app/kind 只挡长度不挡取值：取值合法性在后端（名单外给 400 而非静默返空页），前端再校验一遍会在「后端加新端」时先把新值拦掉
export const rumIssueSearchSchema = createPaginationSearchSchema(RUM_ISSUE_PAGE_SIZE).extend({
    app: z.string().max(RUM_APP_MAX).optional(),
    kind: z.string().max(RUM_KIND_MAX).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
})
export type RumIssueSearch = z.infer<typeof rumIssueSearchSchema>

export const rumEventSearchSchema = createPaginationSearchSchema(RUM_EVENT_PAGE_SIZE).extend({
    fingerprint: z.string().max(RUM_FINGERPRINT_MAX).optional(),
    app: z.string().max(RUM_APP_MAX).optional(),
    kind: z.string().max(RUM_KIND_MAX).optional(),
    route: z.string().max(RUM_ROUTE_MAX).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
})
export type RumEventSearch = z.infer<typeof rumEventSearchSchema>

export type RumIssueRow = AdminRumIssueItem & { id: string }

export const rumKeys = {
    issues: (input: RumIssueSearch) => ["rum", "issues", input] as const,
    events: (input: RumEventSearch) => ["rum", "events", input] as const,
    detail: (id: string) => ["rum", "detail", id] as const,
}

// 时间窗原样透传：后端判的是闭开区间 [from, to)，这里不做任何加减（含当天得由选择器自己把终点推到当天末尾）
export const rumIssueListOptions = (input: RumIssueSearch) =>
    queryOptions({
        queryKey: rumKeys.issues(input),
        queryFn: async ({ signal }) => {
            const result = await AdminRumApi.listRumIssues({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    query: { app: input.app, kind: input.kind, from: input.from, to: input.to },
                },
                signal,
            })
            return {
                // 聚合行没有主键，定位 id 由后端分组键三者拼成：只取 fingerprint 会让同指纹跨端的两行撞成一行
                records: result.records.map((issue): RumIssueRow => ({
                    ...issue,
                    id: `${issue.fingerprint}|${issue.app}|${issue.kind}`,
                })),
                total: result.total,
            }
        },
        placeholderData: (previous) => previous,
    })

export const rumEventListOptions = (input: RumEventSearch) =>
    queryOptions({
        queryKey: rumKeys.events(input),
        queryFn: ({ signal }) =>
            AdminRumApi.listRumEvents({
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
                signal,
            }),
        placeholderData: (previous) => previous,
    })

export const rumEventDetailOptions = (id: string) =>
    queryOptions({
        queryKey: rumKeys.detail(id),
        queryFn: () => AdminRumApi.getRumEventDetail({ path: { id } }),
    })

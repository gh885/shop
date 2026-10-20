import { AdminRumApi, type AdminRumIssueItem } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import type { RumEventSearch, RumIssueSearch } from "./search"

export type RumIssueRow = AdminRumIssueItem & { id: string }

export const rumKeys = {
    all: ["rum"] as const,
    issues: (input: RumIssueSearch) => [...rumKeys.all, "issues", input] as const,
    events: (input: RumEventSearch) => [...rumKeys.all, "events", input] as const,
    detail: (id: string) => [...rumKeys.all, "detail", id] as const,
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

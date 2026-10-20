import { createPaginationSearchSchema } from "@shop/app-kit/data"
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

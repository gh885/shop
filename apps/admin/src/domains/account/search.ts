import { z } from "zod"

import { STAFF_STATUSES, USER_STATUSES } from "./constants"

/**
 * 买家列表的搜索态。
 *
 * <p>新后端 `/api/admin/buyers` 是<b>游标分页</b>（`items` + `nextCursor`），没有服务端总数，
 * 也就没有页码轴。这里只保留筛选条件，翻页由「加载更多」按钮推进游标。
 */
export const userSearchSchema = z.object({
    status: z.enum(USER_STATUSES).optional(),
    keyword: z.string().optional(),
})
export type UserSearch = z.infer<typeof userSearchSchema>

/** 员工列表：与买家同款游标分页，只留筛选态，翻页由「加载更多」推进游标 */
export const staffSearchSchema = z.object({
    status: z.enum(STAFF_STATUSES).optional(),
    keyword: z.string().optional(),
})
export type StaffSearch = z.infer<typeof staffSearchSchema>

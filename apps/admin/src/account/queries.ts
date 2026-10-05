import { AdminAccountApi, StaffStatus, UserStatus } from "@shop/api/sdk"
import { createPaginationSearchSchema } from "@shop/app-kit/data"
import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"

/**
 * 状态筛选的合法取值（契约枚举）：只被下面两份 search schema 读，
 * 所以住这里而非 `constants.ts`（那个文件只放展示常量）。
 */
const UserStatusSchema = z.enum(UserStatus)
const StaffStatusSchema = z.enum(StaffStatus)

/** 买家 / 员工列表的 URL search：同一形状，只差状态枚举 */
export const userSearchSchema = createPaginationSearchSchema(20).extend({
    status: UserStatusSchema.optional(),
    keyword: z.string().optional(),
})
export const staffSearchSchema = createPaginationSearchSchema(20).extend({
    status: StaffStatusSchema.optional(),
    keyword: z.string().optional(),
})
export type UserSearch = z.infer<typeof userSearchSchema>
export type StaffSearch = z.infer<typeof staffSearchSchema>

export const accountKeys = {
    users: {
        all: ["admin", "account", "users"] as const,
        list: (input: UserSearch) => [...accountKeys.users.all, input] as const,
    },
    staff: {
        all: ["admin", "account", "staff"] as const,
        list: (input: StaffSearch) => [...accountKeys.staff.all, input] as const,
    },
} as const

export const adminUsersOptions = (input: UserSearch) =>
    queryOptions({
        queryKey: accountKeys.users.list(input),
        queryFn: async () => {
            const page = await AdminAccountApi.listAdminUsers({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    status: input.status,
                    keyword: input.keyword,
                },
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (previous) => previous,
    })

export const adminStaffOptions = (input: StaffSearch) =>
    queryOptions({
        queryKey: accountKeys.staff.list(input),
        queryFn: async () => {
            const page = await AdminAccountApi.listAdminStaff({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    status: input.status,
                    keyword: input.keyword,
                },
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (previous) => previous,
    })

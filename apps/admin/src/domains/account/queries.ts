import { AdminAccountApi } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"
import type { StaffSearch, UserSearch } from "./search"

export const accountKeys = {
    users: {
        all: ["account", "users"] as const,
        list: (input: UserSearch) => [...accountKeys.users.all, input] as const,
    },
    staff: {
        all: ["account", "staff"] as const,
        list: (input: StaffSearch) => [...accountKeys.staff.all, input] as const,
    },
} as const

export const adminUsersOptions = (input: UserSearch) =>
    queryOptions({
        queryKey: accountKeys.users.list(input),
        queryFn: async ({ signal }) => {
            const page = await AdminAccountApi.listAdminUsers({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    status: input.status,
                    keyword: input.keyword,
                },
                signal,
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (previous) => previous,
    })

export const adminStaffOptions = (input: StaffSearch) =>
    queryOptions({
        queryKey: accountKeys.staff.list(input),
        queryFn: async ({ signal }) => {
            const page = await AdminAccountApi.listAdminStaff({
                query: {
                    pageParams: { page: input.page, size: input.size },
                    status: input.status,
                    keyword: input.keyword,
                },
                signal,
            })
            return { records: page.records, total: page.total }
        },
        placeholderData: (previous) => previous,
    })

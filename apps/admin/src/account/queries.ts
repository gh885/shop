import { AdminAccountApi, type StaffStatus, type UserStatus } from "@shop/api/sdk"
import { queryOptions } from "@tanstack/react-query"

export const accountKeys = {
    users: {
        all: ["admin", "account", "users"] as const,
        list: (input: { status?: UserStatus; keyword?: string; page: number; size: number }) =>
            [
                "admin",
                "account",
                "users",
                input.status ?? "all",
                input.keyword ?? "",
                input.page,
                input.size,
            ] as const,
    },
    staff: {
        all: ["admin", "account", "staff"] as const,
        list: (input: { status?: StaffStatus; keyword?: string; page: number; size: number }) =>
            [
                "admin",
                "account",
                "staff",
                input.status ?? "all",
                input.keyword ?? "",
                input.page,
                input.size,
            ] as const,
    },
} as const

export const adminUsersOptions = (input: {
    status?: UserStatus
    keyword?: string
    page: number
    size: number
}) =>
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

export const adminStaffOptions = (input: {
    status?: StaffStatus
    keyword?: string
    page: number
    size: number
}) =>
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

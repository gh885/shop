import { AdminBuyerControllerApi, StaffAdminControllerApi } from "@shop/api/sdk"
import { infiniteQueryOptions, useMutation } from "@tanstack/react-query"

import { message } from "#/locales/message"
import type { StaffSearch, UserSearch } from "./search"

export const accountKeys = {
    users: {
        all: ["account", "buyers"] as const,
        list: (input: UserSearch) => [...accountKeys.users.all, input] as const,
    },
    staff: {
        all: ["account", "staff"] as const,
        list: (input: StaffSearch) => [...accountKeys.staff.all, input] as const,
    },
} as const

/**
 * 买家列表：游标分页。响应 `{ items, nextCursor }` 直接交给 infiniteQuery，
 * `nextCursor` 为 null 即到底。
 */
export const adminBuyersOptions = (input: UserSearch) =>
    infiniteQueryOptions({
        queryKey: accountKeys.users.list(input),
        queryFn: ({ pageParam, signal }) =>
            AdminBuyerControllerApi.listBuyers({
                query: { status: input.status, keyword: input.keyword, cursor: pageParam },
                signal,
            }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => (last.nextCursor === "" ? undefined : last.nextCursor),
    })

/** 员工列表：与买家同款游标分页，游标是服务端 (created_at, id) 复合键 */
export const adminStaffOptions = (input: StaffSearch) =>
    infiniteQueryOptions({
        queryKey: accountKeys.staff.list(input),
        queryFn: ({ pageParam, signal }) =>
            StaffAdminControllerApi.listStaff({
                query: { status: input.status, keyword: input.keyword, cursor: pageParam },
                signal,
            }),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last) => (last.nextCursor === "" ? undefined : last.nextCursor),
    })

/** 封禁 / 解封买家：`status` 只收 active / disabled */
export function useUpdateBuyerStatus() {
    return useMutation({
        mutationFn: (input: { buyerId: string; status: "active" | "disabled" }) =>
            AdminBuyerControllerApi.updateBuyerStatus({
                path: { buyerId: input.buyerId },
                body: { status: input.status },
            }),
        meta: {
            success: message("account.statusUpdate.done"),
            error: message("account.statusUpdate.failed"),
            invalidates: [accountKeys.users.all],
        },
    })
}

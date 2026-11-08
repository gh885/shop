import { message } from "#/locales/message"
import { BuyerNotificationControllerApi } from "@shop/api/sdk"
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query"

import { useIsLoggedIn } from "#/shared/api/auth"

const DEFAULT_PAGE_SIZE = 20

/** 通知缓存 key（列表与未读数都挂在 all 下，标已读只失效一次） */
const notificationAll = ["notifications"] as const

export const notificationKeys = {
    all: notificationAll,
    list: (size: number, cursor: string) => [...notificationAll, "list", size, cursor] as const,
    unreadCount: [...notificationAll, "unread-count"] as const,
} as const

/** 通知列表：新到旧，游标翻页。 */
export const notificationsOptions = ({ size = DEFAULT_PAGE_SIZE, cursor = "" } = {}) =>
    queryOptions({
        queryKey: notificationKeys.list(size, cursor),
        queryFn: async ({ signal }) => {
            const page = await BuyerNotificationControllerApi.page({
                query: { cursor: cursor || undefined, limit: size },
                signal,
            })
            return { items: page.items, nextCursor: page.nextCursor }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })

const unreadCountOptions = queryOptions({
    queryKey: notificationKeys.unreadCount,
    queryFn: async ({ signal }): Promise<number> =>
        BuyerNotificationControllerApi.unreadCount({ signal }),
    staleTime: 30_000,
    throwOnError: false,
})

/** 未读计数：铃铛徽标，登录后才轮询。 */
export function useUnreadNotificationCount() {
    const isLoggedIn = useIsLoggedIn()
    return useQuery({ ...unreadCountOptions, enabled: isLoggedIn, refetchInterval: 60_000 })
}

/** 标一条已读。点击即跳转，失败静默——通知本身还在，用户无感。 */
export function useMarkNotificationRead() {
    return useMutation({
        mutationFn: (id: string) => BuyerNotificationControllerApi.markRead({ path: { id } }),
        meta: {
            silentError: true,
            invalidates: [notificationKeys.all],
        },
    })
}

/** 全部已读。 */
export function useMarkAllNotificationsRead() {
    return useMutation({
        mutationFn: () => BuyerNotificationControllerApi.markAllRead(),
        meta: {
            success: message("notification.toast.allRead"),
            error: message("notification.toast.markReadFailed"),
            invalidates: [notificationKeys.all],
        },
    })
}

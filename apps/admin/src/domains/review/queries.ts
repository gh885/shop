import { AdminReviewControllerApi } from "@shop/api/sdk"
import { infiniteQueryOptions, useMutation } from "@tanstack/react-query"

import { message } from "#/locales/message"

export const reviewKeys = {
    all: ["reviews"] as const,
    list: (status: string | undefined) => ["reviews", "admin", status ?? "all"] as const,
}

/** 平台治理列表：游标无限翻（页大小 50），status 筛在后端做。 */
export const adminReviewsOptions = (status: string | undefined) =>
    infiniteQueryOptions({
        queryKey: reviewKeys.list(status),
        queryFn: ({ pageParam, signal }) =>
            AdminReviewControllerApi.list3({
                query: { status, cursor: pageParam === "" ? undefined : pageParam, limit: 50 },
                signal,
            }),
        initialPageParam: "",
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    })

/** 隐藏违规评价。理由进审计不进评价行。 */
export function useHideReview() {
    return useMutation({
        mutationFn: (input: { id: string; reason?: string }) =>
            AdminReviewControllerApi.hide({
                path: { id: input.id },
                body: { reason: input.reason },
            }),
        meta: {
            success: message("review.toast.hidden"),
            error: message("review.toast.hideFailed"),
            invalidates: [reviewKeys.all],
        },
    })
}

export function useRestoreReview() {
    return useMutation({
        mutationFn: (id: string) => AdminReviewControllerApi.restore({ path: { id } }),
        meta: {
            success: message("review.toast.restored"),
            error: message("review.toast.restoreFailed"),
            invalidates: [reviewKeys.all],
        },
    })
}

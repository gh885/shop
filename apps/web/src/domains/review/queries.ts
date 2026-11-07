import { message } from "#/locales/message"
import {
    BuyerMediaControllerApi,
    BuyerReviewControllerApi,
    type SpuReviewSection,
    type SpuReviewSummary,
} from "@shop/api/sdk"
import { queryOptions, useMutation } from "@tanstack/react-query"

import { toReviewItem } from "./rules"
import type { ReviewFilter, ReviewPageData, SpuReviewSectionData } from "./rules"

const DEFAULT_PAGE_SIZE = 20

const reviewAll = ["reviews"] as const

export const reviewKeys = {
    all: reviewAll,
    pending: (size: number, cursor: string) => [...reviewAll, "pending", size, cursor] as const,
    mine: (size: number, cursor: string) => [...reviewAll, "mine", size, cursor] as const,
    count: [...reviewAll, "pending-count"] as const,
    section: (spuId: string, filter: ReviewFilter, size: number, cursor: string) =>
        [...reviewAll, "section", spuId, filter, size, cursor] as const,
}

/** 待评价列表：后端预生成的行，带下单快照。 */
export const pendingReviewsOptions = ({ size = DEFAULT_PAGE_SIZE, cursor = "" } = {}) =>
    queryOptions({
        queryKey: reviewKeys.pending(size, cursor),
        queryFn: async ({ signal }): Promise<ReviewPageData> => {
            const page = await BuyerReviewControllerApi.pending({
                query: { cursor: cursor || undefined, limit: size },
                signal,
            })
            return { items: page.items.map(toReviewItem), nextCursor: page.nextCursor }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })

/** 我的评价（含被平台隐藏的）。 */
export const myReviewsOptions = ({ size = DEFAULT_PAGE_SIZE, cursor = "" } = {}) =>
    queryOptions({
        queryKey: reviewKeys.mine(size, cursor),
        queryFn: async ({ signal }): Promise<ReviewPageData> => {
            const page = await BuyerReviewControllerApi.mine({
                query: { cursor: cursor || undefined, limit: size },
                signal,
            })
            return { items: page.items.map(toReviewItem), nextCursor: page.nextCursor }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })

/** 待评价计数：首页卡片。 */
export const pendingReviewCountOptions = () =>
    queryOptions({
        queryKey: reviewKeys.count,
        queryFn: ({ signal }) => BuyerReviewControllerApi.pendingCount({ signal }),
        staleTime: 60_000,
    })

/** 商详评价区：统计头 + 一页列表，匿名可读。 */
export const productReviewsOptions = ({
    spuId,
    filter = "all",
    size = 10,
    cursor = "",
}: {
    spuId: string
    filter?: ReviewFilter
    size?: number
    cursor?: string
}) =>
    queryOptions({
        queryKey: reviewKeys.section(spuId, filter, size, cursor),
        queryFn: async ({ signal }): Promise<SpuReviewSectionData> => {
            const section: SpuReviewSection = await BuyerReviewControllerApi.publicSection({
                query: { spuId, filter, cursor: cursor || undefined, limit: size },
                signal,
            })
            const stats: SpuReviewSummary = section.stats
            return {
                stats,
                items: section.items.map(toReviewItem),
                nextCursor: section.nextCursor,
            }
        },
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    })

export function useSubmitReview() {
    return useMutation({
        mutationFn: (input: {
            reviewId: string
            overall: number
            descScore?: number
            serviceScore?: number
            logisticsScore?: number
            content?: string
            images: string[]
            anonymous: boolean
        }) =>
            BuyerReviewControllerApi.publish({
                path: { id: input.reviewId },
                body: {
                    overall: input.overall,
                    descScore: input.descScore,
                    serviceScore: input.serviceScore,
                    logisticsScore: input.logisticsScore,
                    content: input.content,
                    images: input.images,
                    anonymous: input.anonymous,
                },
            }),
        meta: {
            success: message("review.toast.published"),
            error: message("review.toast.publishFailed"),
            invalidates: [reviewKeys.all],
        },
    })
}

/** 追评一次：发布后 90 天内。 */
export function useAppendReview() {
    return useMutation({
        mutationFn: (input: { reviewId: string; content?: string; images: string[] }) =>
            BuyerReviewControllerApi.append({
                path: { id: input.reviewId },
                body: { content: input.content, images: input.images },
            }),
        meta: {
            success: message("review.toast.appended"),
            error: message("review.toast.appendFailed"),
            invalidates: [reviewKeys.all],
        },
    })
}

/** 浏览器直传对象存储，返回存库 key。评价晒图与日后的售后凭证走同一扇门。 */
export async function uploadReviewImage(file: File): Promise<string> {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replaceAll(/[^a-z0-9]/g, "")
    const ticket = await BuyerMediaControllerApi.issueImageTicket1({ query: { ext } })
    if (!ticket.uploadUrl || !ticket.token || !ticket.key) {
        throw new Error("UPLOAD_TICKET_INVALID")
    }
    return putObject(ticket.uploadUrl, ticket.token, ticket.key, file)
}

/** 凭证三件套齐了才走到这：表单直传，非 2xx 把状态码原样带回给上层提示。 */
async function putObject(
    uploadUrl: string,
    token: string,
    key: string,
    file: File,
): Promise<string> {
    const form = new FormData()
    form.append("token", token)
    form.append("key", key)
    form.append("file", file)
    const response = await fetch(uploadUrl, { method: "POST", body: form })
    if (!response.ok) {
        throw new Error(`UPLOAD_FAILED_${response.status}`)
    }
    return key
}

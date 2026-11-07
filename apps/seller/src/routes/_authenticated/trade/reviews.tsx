import { useState } from "react"

import { createFileRoute } from "@tanstack/react-router"
import { useT } from "#/locales/use-t"
import { useQuery } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Skeleton,
    Textarea,
} from "@shop/ui-web"
import { MessageSquareText } from "lucide-react"

import { ReviewRow } from "#/domains/review/review-list"
import { shopReviewsOptions, useReplyReview } from "#/domains/review/queries"
import { parseReviewsSearch } from "#/domains/review/search"
import type { ReviewItem } from "#/domains/review/rules"
import { useShop } from "#/domains/shop"

export const Route = createFileRoute("/_authenticated/trade/reviews")({
    validateSearch: parseReviewsSearch,
    component: ReviewsPage,
})

const CONTENT_MAX = 500

function ReplyDialog({
    item,
    onOpenChange,
    pending,
    onReply,
}: {
    item: ReviewItem | undefined
    onOpenChange: (open: boolean) => void
    pending: boolean
    onReply: (input: { reviewId: string; content: string }) => Promise<unknown>
}) {
    const t = useT()
    const [content, setContent] = useState("")

    // 失败不关窗：await 的异常向上抛，弹窗保持输入；提示走全局 toast
    async function handleSubmit() {
        if (!item || content.trim().length === 0) return
        await onReply({ reviewId: item.id, content: content.trim() })
        onOpenChange(false)
    }

    return (
        <Dialog
            open={item !== undefined}
            onOpenChange={(open) => {
                if (!open) setContent("")
                onOpenChange(open)
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t("review.reply.title")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <Textarea
                        value={content}
                        onChange={(event) => setContent(event.target.value.slice(0, CONTENT_MAX))}
                        placeholder={t("review.reply.placeholder")}
                        rows={4}
                    />
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                            {content.length}/{CONTENT_MAX}
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                {t("review.reply.cancel")}
                            </Button>
                            <Button
                                disabled={pending || content.trim().length === 0}
                                onClick={() => void handleSubmit()}
                            >
                                {t("review.reply.submit")}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

function ReviewsPage() {
    const t = useT()
    const search = Route.useSearch()
    const navigate = Route.useNavigate()
    const shop = useShop()

    const reviews = useQuery(
        shopReviewsOptions({
            shopId: shop.id,
            star: search.star,
            replied: search.replied,
            cursor: search.cursor,
        }),
    )
    const reply = useReplyReview()
    const [replyTarget, setReplyTarget] = useState<ReviewItem | undefined>()

    function apply(next: { star?: number; replied?: boolean; cursor?: string }) {
        void navigate({
            search: {
                // URL 值是字符串（validateSearch 的输入侧）：数字与布尔在边界上转回去
                star: next.star === undefined ? undefined : String(next.star),
                replied: next.replied === undefined ? undefined : next.replied ? "true" : "false",
                cursor:
                    next.star === undefined && next.replied === undefined
                        ? (next.cursor ?? "")
                        : "",
            },
        })
    }

    const records = reviews.data?.items ?? []

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                {[
                    { label: t("review.filter.all"), value: undefined },
                    ...[1, 2, 3, 4, 5].map((star) => ({ label: `${star} ★`, value: star })),
                ].map((option) => (
                    <Button
                        key={option.label}
                        size="xs"
                        variant={search.star === option.value ? "default" : "outline"}
                        onClick={() => apply({ star: option.value, replied: search.replied })}
                    >
                        {option.label}
                    </Button>
                ))}
                <span className="mx-2 h-4 w-px bg-border" />
                {[
                    { label: t("review.replyFilter.any"), value: undefined },
                    { label: t("review.replyFilter.pending"), value: false },
                    { label: t("review.replyFilter.done"), value: true },
                ].map((option) => (
                    <Button
                        key={option.label}
                        size="xs"
                        variant={search.replied === option.value ? "default" : "outline"}
                        onClick={() => apply({ replied: option.value, star: search.star })}
                    >
                        {option.label}
                    </Button>
                ))}
            </div>

            {reviews.isPending ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        // oxlint-disable-next-line react/no-array-index-key, react-doctor/no-array-index-key
                        <Skeleton
                            key={index}
                            className="h-28 w-full rounded-lg"
                        />
                    ))}
                </div>
            ) : records.length === 0 ? (
                <Empty className="py-16">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <MessageSquareText />
                        </EmptyMedia>
                        <EmptyTitle>{t("review.empty.title")}</EmptyTitle>
                        <EmptyDescription>{t("review.empty.description")}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="space-y-3">
                    {records.map((item) => (
                        <ReviewRow
                            key={item.id}
                            item={item}
                            busy={reply.isPending}
                            onReply={setReplyTarget}
                        />
                    ))}
                    {reviews.data?.nextCursor && (
                        <div className="flex justify-center">
                            <Button
                                variant="outline"
                                onClick={() =>
                                    void navigate({
                                        search: {
                                            star:
                                                search.star === undefined
                                                    ? undefined
                                                    : String(search.star),
                                            replied:
                                                search.replied === undefined
                                                    ? undefined
                                                    : search.replied
                                                      ? "true"
                                                      : "false",
                                            cursor: reviews.data.nextCursor ?? "",
                                        },
                                    })
                                }
                            >
                                {t("review.loadMore")}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <ReplyDialog
                item={replyTarget}
                onOpenChange={(open) => {
                    if (!open) setReplyTarget(undefined)
                }}
                pending={reply.isPending}
                onReply={async (input) => {
                    await reply.mutateAsync(input)
                }}
            />
        </div>
    )
}

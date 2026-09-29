import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
    Badge,
    Button,
    Card,
    CardContent,
    Empty,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    Image,
    Skeleton,
} from "@shop/ui-web"
import { MessageSquareOff } from "lucide-react"
import { formatDateTime, useI18n } from "@shop/app-kit"
import { imgUrl } from "#/shared/lib/image"
import { RATING_LABEL, REVIEW_PAGE_SIZE } from "./constants"
import { Stars } from "./ReviewDialog"
import { productReviewsOptions } from "./queries"

/**
 * 商详「用户评价」区（REV-12~15）：顶部聚合（条数 / 平均星级 / 好评率）+ 分页列表。
 *
 * 聚合与列表都来自后端，前端不重算（评价不是前端能算的东西：分母是「全部历史评分行」，
 * 前端手里的只有当前这一页）。列表按评分行展示（不是按评价单），一行里带追评与卖家回复。
 */
export function ProductReviews({ productId }: { productId: string }) {
    const { locale } = useI18n()
    const [page, setPage] = useState(1)
    const { data, isPending } = useQuery(productReviewsOptions(productId, page))

    return (
        <Card
            id="reviews"
            variant="plain"
            className="mt-5 scroll-mt-20"
        >
            <CardContent>
                <h2 className="mb-4 border-l-4 border-primary pl-3 text-lg font-bold text-foreground">
                    用户评价
                </h2>
                {isPending ? (
                    <ReviewsSkeleton />
                ) : data && data.summary.total > 0 ? (
                    <>
                        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2">
                            <span className="text-2xl font-bold tabular-nums">
                                {data.summary.averageRating.toFixed(1)}
                            </span>
                            <Stars value={Math.round(Number(data.summary.averageRating))} />
                            <span className="text-sm text-muted-foreground">
                                共 {data.summary.total} 条评价 · 好评率{" "}
                                {data.summary.positiveRate.toFixed(1)}%
                            </span>
                        </div>
                        <ul className="flex flex-col divide-y">
                            {data.page.records.map((review) => (
                                <li
                                    key={review.id}
                                    className="py-4 first:pt-0"
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Stars
                                            value={review.rating}
                                            label={`${review.rating} 星`}
                                        />
                                        <span className="text-xs text-muted-foreground">
                                            {RATING_LABEL[review.rating] ?? ""}
                                        </span>
                                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                                            {formatDateTime(review.createdAt, locale)}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {review.name}
                                        <span className="ml-2 text-xs">买家 {review.buyer}</span>
                                    </p>
                                    {review.content && (
                                        <p className="mt-1 text-sm leading-relaxed">
                                            {review.content}
                                        </p>
                                    )}
                                    {review.images && review.images.length > 0 && (
                                        <div className="mt-2 flex gap-2">
                                            {review.images.map((key) => (
                                                <Image
                                                    key={key}
                                                    src={imgUrl(key)}
                                                    alt=""
                                                    className="size-20 object-cover"
                                                    radius="md"
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {review.appendText && (
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            <Badge variant="secondary">追评</Badge>{" "}
                                            {review.appendText}
                                        </p>
                                    )}
                                    {review.reply && (
                                        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">
                                            <span className="font-medium">卖家回复：</span>
                                            {review.reply}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-4 flex justify-center">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => p - 1)}
                            >
                                上一页
                            </Button>
                            <span className="mx-3 self-center text-sm text-muted-foreground tabular-nums">
                                {page} /{" "}
                                {Math.max(1, Math.ceil(data.page.total / REVIEW_PAGE_SIZE))}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page >= Math.ceil(data.page.total / REVIEW_PAGE_SIZE)}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                下一页
                            </Button>
                        </div>
                    </>
                ) : (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <MessageSquareOff />
                            </EmptyMedia>
                            <EmptyTitle>暂无评价</EmptyTitle>
                            <EmptyDescription>还没有买家对这个商品说过话</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
            </CardContent>
        </Card>
    )
}

/** 加载中：与真实行高一致的骨架（换到真内容时不跳） */
function ReviewsSkeleton() {
    return (
        <div
            className="flex flex-col gap-4"
            aria-hidden
        >
            <Skeleton className="h-6 w-48" />
            {Array.from({ length: 3 }, (_, i) => (
                <Skeleton
                    key={i}
                    className="h-20 w-full rounded-md"
                />
            ))}
        </div>
    )
}

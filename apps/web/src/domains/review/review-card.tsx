import { imgUrl } from "#/shared/lib/image"
import { TimeText } from "@shop/app-kit/display"
import { Image } from "@shop/ui-web"
import { useT } from "#/locales/use-t"

import { specText } from "./rules"
import type { ReviewItem } from "./rules"
import { StarRating } from "./stars"

/**
 * 评价卡。三种面共用一张卡：
 * - pending：只有商品快照 + 评价按钮（overall 为空）
 * - mine：自己的评价，带状态（hidden 徽标）与追评入口
 * - public：公开面，昵称脱敏 / 匿名，带商家回复
 */
export function ReviewCard({
    item,
    onReview,
    onAppend,
}: {
    item: ReviewItem
    onReview?: (item: ReviewItem) => void
    onAppend?: (item: ReviewItem) => void
}) {
    const t = useT()
    const spec = specText(item.specValues)

    return (
        <div className="rounded-lg border p-4">
            <div className="flex gap-3">
                <Image
                    src={imgUrl(item.imageUrl)}
                    alt={item.title}
                    className="size-16 shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.title}</p>
                            {spec && <p className="mt-0.5 text-xs text-muted-foreground">{spec}</p>}
                        </div>
                        {item.overall != null && <StarRating value={item.overall} />}
                    </div>

                    {item.status === "pending" ? (
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                                {t("review.card.windowUntil")}{" "}
                                {item.reviewableUntil && <TimeText iso={item.reviewableUntil} />}
                            </span>
                            {onReview && (
                                <button
                                    type="button"
                                    onClick={() => onReview(item)}
                                    className="text-sm font-medium text-primary hover:underline"
                                >
                                    {t("review.card.toReview")}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="mt-2 space-y-2">
                            {item.status === "hidden" && (
                                <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                    {t("review.card.hidden")}
                                </span>
                            )}
                            {item.content && (
                                <p className="text-sm leading-relaxed">{item.content}</p>
                            )}
                            {item.images.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {item.images.map((key) => (
                                        <Image
                                            key={key}
                                            src={imgUrl(key)}
                                            alt={t("review.card.reviewImage")}
                                            className="size-20 object-cover"
                                        />
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>
                                    {item.anonymous ? t("review.card.anonymous") : item.displayName}
                                </span>
                                {item.reviewedAt && <TimeText iso={item.reviewedAt} />}
                            </div>

                            {item.content2 && (
                                <div className="rounded-md bg-muted/50 p-2.5">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        {t("review.card.appendLabel")}
                                    </p>
                                    <p className="mt-1 text-sm">{item.content2}</p>
                                    {item.images2.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {item.images2.map((key) => (
                                                <Image
                                                    key={key}
                                                    src={imgUrl(key)}
                                                    alt={t("review.card.reviewImage")}
                                                    className="size-20 object-cover"
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            {!item.content2 && item.status === "published" && onAppend && (
                                <button
                                    type="button"
                                    onClick={() => onAppend(item)}
                                    className="text-xs text-primary hover:underline"
                                >
                                    {t("review.card.appendAction")}
                                </button>
                            )}

                            {item.replyContent && (
                                <div className="rounded-md border-l-2 border-primary/40 bg-muted/40 p-2.5">
                                    <p className="text-xs font-medium text-primary">
                                        {t("review.card.replyLabel")}
                                    </p>
                                    <p className="mt-1 text-sm">{item.replyContent}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

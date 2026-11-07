import { useState } from "react"

import { useT } from "#/locales/use-t"
import { cn } from "@shop/ui-web"
import { useQuery } from "@tanstack/react-query"

import { productReviewsOptions } from "./queries"
import { REVIEW_FILTERS } from "./rules"
import type { ReviewFilter } from "./rules"
import { ReviewCard } from "./review-card"
import { StarRating } from "./stars"

const FILTER_LABEL_KEY: Record<
    ReviewFilter,
    | "review.filter.all"
    | "review.filter.withImage"
    | "review.filter.good"
    | "review.filter.mid"
    | "review.filter.bad"
> = {
    all: "review.filter.all",
    with_image: "review.filter.withImage",
    good: "review.filter.good",
    mid: "review.filter.mid",
    bad: "review.filter.bad",
}

/**
 * 商品详情的公开评价区：统计头（总数/均分/好评率）+ 筛选 + 列表。
 *
 * <p>匿名可读；筛选翻档回到第一页，同档内「加载更多」顺游标走。
 * 好评率 = (好评 + 中评) / 总数？不——淘宝口径好评率只算 4-5 星，3 星（中评）不计入好评率。
 */
export function ProductReviewsSection({ spuId }: { spuId: string }) {
    const t = useT()
    const [filter, setFilter] = useState<ReviewFilter>("all")
    const [cursor, setCursor] = useState("")

    const { data } = useQuery(productReviewsOptions({ spuId, filter, cursor }))
    const section = data

    return (
        <section
            id="reviews"
            className="rounded-lg bg-background p-6"
        >
            <h3 className="text-lg font-semibold">{t("product.detail.section.reviews")}</h3>

            {section && section.stats.total > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <span className="inline-flex items-center gap-2">
                        <span className="text-2xl font-bold">
                            {(section.stats.avgScore / 100).toFixed(1)}
                        </span>
                        <StarRating value={Math.round(section.stats.avgScore / 100)} />
                    </span>
                    <span className="text-muted-foreground">
                        {t("review.section.total", { total: section.stats.total })}
                    </span>
                    <span className="text-muted-foreground">
                        {t("review.section.goodRate", {
                            rate:
                                section.stats.total > 0
                                    ? Math.round(
                                          (section.stats.goodCount / section.stats.total) * 100,
                                      )
                                    : 0,
                        })}
                    </span>
                    <span className="text-muted-foreground">
                        {t("review.section.withImage", { count: section.stats.withImageCount })}
                    </span>
                </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
                {REVIEW_FILTERS.map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => {
                            setFilter(value)
                            setCursor("")
                        }}
                        className={cn(
                            "rounded-full border px-3 py-1 text-xs transition-colors",
                            filter === value
                                ? "border-primary bg-primary/10 text-primary"
                                : "text-muted-foreground hover:border-foreground/30",
                        )}
                    >
                        {t(FILTER_LABEL_KEY[value])}
                    </button>
                ))}
            </div>

            <div className="mt-4 space-y-3">
                {(section?.items ?? []).map((item) => (
                    <ReviewCard
                        key={item.id}
                        item={item}
                    />
                ))}
            </div>

            {section?.items.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("review.section.empty")}
                </p>
            )}

            {section?.nextCursor && (
                <div className="mt-4 flex justify-center">
                    <button
                        type="button"
                        onClick={() => setCursor(section.nextCursor!)}
                        className="text-sm text-primary hover:underline"
                    >
                        {t("common.loadMore")}
                    </button>
                </div>
            )}
        </section>
    )
}

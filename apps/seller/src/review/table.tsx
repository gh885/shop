import type { ProductReviewItem } from "@shop/api/sdk"
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { Star } from "lucide-react"
import { Badge, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import { TableCard } from "#/shared/ui/TableCard"
import { ReviewReplyDialog } from "./reply-dialog"

/** 只读星级（与买家端同一个形状：实心=得分，空心=未得） */
function Stars({ value }: { value: number }) {
    const t = useT("review")
    return (
        <span
            className="inline-flex items-center gap-0.5"
            aria-label={t("review.list.stars.aria", { value })}
        >
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    className={
                        n <= value
                            ? "size-4 fill-cta-alt text-cta-alt"
                            : "size-4 text-muted-foreground/40"
                    }
                    aria-hidden
                />
            ))}
        </span>
    )
}

/**
 * 本店评价表格：商品 / 星级 / 内容（含买家追评）/ 卖家回复 / 时间 / 操作。
 *
 * 纯展示 + 事件上抛：数据与分页由容器持有（URL 同步），回复动作的弹窗状态也在容器。
 * 「已回复」的行不再给回复入口（后端也硬拒：一条评价只回一次）。
 */
export function ReviewTable({
    rows,
    total,
    page,
    pageSize,
    onPageChange,
}: {
    rows: ProductReviewItem[]
    total: number
    page: number
    pageSize: number
    onPageChange: (page: number) => void
}) {
    const { locale } = useI18n()
    const t = useT("review")
    return (
        <TableCard
            total={total}
            unit={t("review.list.pagination.unit")}
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead>{t("review.list.header.product")}</TableHead>
                    <TableHead>{t("review.list.header.rating")}</TableHead>
                    <TableHead>{t("review.list.header.content")}</TableHead>
                    <TableHead>{t("review.list.header.time")}</TableHead>
                    <TableHead className="text-right">{t("review.list.header.action")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((review) => (
                    <TableRow key={review.id}>
                        <TableCell>{review.name}</TableCell>
                        <TableCell>
                            <Stars value={review.rating} />
                        </TableCell>
                        <TableCell className="max-w-80">
                            {review.content ? (
                                // whitespace-normal 不可省：TableCell 基类是 whitespace-nowrap，
                                // 不换行的话 line-clamp-2 永不触发，正文被硬裁且没有省略号（DESIGN.md §6.2）
                                <p
                                    className="line-clamp-2 whitespace-normal"
                                    title={review.content}
                                >
                                    {review.content}
                                </p>
                            ) : (
                                <span className="text-muted-foreground">
                                    {t("review.list.content.onlyRating")}
                                </span>
                            )}
                            {review.appendText && (
                                <p
                                    className="mt-1 line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                                    title={review.appendText}
                                >
                                    <Badge variant="secondary">
                                        {t("review.list.badge.append")}
                                    </Badge>{" "}
                                    {review.appendText}
                                </p>
                            )}
                            {review.reply && (
                                <p
                                    className="mt-1 line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                                    title={review.reply}
                                >
                                    <Badge variant="outline">{t("review.list.replied")}</Badge>{" "}
                                    {review.reply}
                                </p>
                            )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                            {formatDateTime(review.createdAt, locale)}
                        </TableCell>
                        <TableCell className="text-right">
                            {review.reply ? (
                                <span className="text-muted-foreground">
                                    {t("review.list.replied")}
                                </span>
                            ) : (
                                <ReviewReplyDialog
                                    reviewId={review.id}
                                    productName={review.name}
                                    buyerLabel={review.buyer}
                                />
                            )}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </TableCard>
    )
}

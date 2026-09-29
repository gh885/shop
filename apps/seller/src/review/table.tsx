import type { ProductReviewItem } from "@shop/api/sdk"
import { formatDateTime, useI18n } from "@shop/app-kit"
import { Star } from "lucide-react"
import { Badge, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@shop/ui-web"
import { TableCard } from "#/shared/ui/TableCard"
import { ReviewReplyDialog } from "./reply-dialog"

/** 只读星级（与买家端同一个形状：实心=得分，空心=未得） */
function Stars({ value }: { value: number }) {
    return (
        <span
            className="inline-flex items-center gap-0.5"
            aria-label={`${value} 星`}
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
    return (
        <TableCard
            total={total}
            unit="条评价"
            page={page}
            pageSize={pageSize}
            onPageChange={onPageChange}
        >
            <TableHeader>
                <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead>评分</TableHead>
                    <TableHead>评价内容</TableHead>
                    <TableHead>评价时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
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
                                <span className="text-muted-foreground">（只打了分）</span>
                            )}
                            {review.appendText && (
                                <p
                                    className="mt-1 line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                                    title={review.appendText}
                                >
                                    <Badge variant="secondary">买家追评</Badge> {review.appendText}
                                </p>
                            )}
                            {review.reply && (
                                <p
                                    className="mt-1 line-clamp-2 whitespace-normal text-xs text-muted-foreground"
                                    title={review.reply}
                                >
                                    <Badge variant="outline">已回复</Badge> {review.reply}
                                </p>
                            )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                            {formatDateTime(review.createdAt, locale)}
                        </TableCell>
                        <TableCell className="text-right">
                            {review.reply ? (
                                <span className="text-muted-foreground">已回复</span>
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

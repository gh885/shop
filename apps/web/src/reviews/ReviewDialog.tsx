import { useEffect, useState } from "react"
import { ReviewsApi } from "@shop/api/sdk"
import type { OrderItem } from "#/order"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogTitle,
    Field,
    FieldLabel,
    Textarea,
} from "@shop/ui-web"
import { Star } from "lucide-react"
import { formatDateTime } from "@shop/app-kit"
import { myReviewKeys, myReviewOptions } from "./my-review-queries"

/** 评价文字上限：镜像后端 `NoteFieldRules.FREE_TEXT_MAX`（同一档「一段人写的说明」） */
const CONTENT_MAX = 200
const APPEND_MAX = 200

/** 只读星级：已提交的评价与商详列表都用它画星（不响应点击） */
export function Stars({ value, label }: { value: number; label?: string }) {
    return (
        <span
            className="inline-flex items-center gap-0.5"
            {...(label ? { "aria-label": label } : { "aria-hidden": true })}
        >
            {[1, 2, 3, 4, 5].map((n) => (
                <Star
                    key={n}
                    className={
                        n <= value
                            ? "size-4 fill-cta-alt text-cta-alt"
                            : "size-4 text-muted-foreground/40"
                    }
                />
            ))}
        </span>
    )
}

/** 星级选择器（一到五星，可键盘操作：真正的 radio 组而不是 div） */
function RatingPicker({
    value,
    onChange,
    name,
}: {
    value: number
    onChange: (value: number) => void
    name: string
}) {
    return (
        <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label="评分"
        >
            {[1, 2, 3, 4, 5].map((n) => (
                <label
                    key={n}
                    className="cursor-pointer p-0.5"
                >
                    {/* 真正的 radio：键盘（方向键/空格）与读屏行为都免费拿到，
                        星形只是它上面的皮肤；用 button+role 得自己补这些 */}
                    <input
                        type="radio"
                        name={name}
                        className="sr-only"
                        checked={value === n}
                        onChange={() => onChange(n)}
                    />
                    <Star
                        className={
                            n <= value
                                ? "size-5 fill-cta-alt text-cta-alt"
                                : "size-5 text-muted-foreground/40"
                        }
                        aria-hidden
                    />
                    <span className="sr-only">{n} 星</span>
                </label>
            ))}
        </div>
    )
}

/**
 * 订单评价弹窗（REV-01~07、09）：
 * - 还没评价（后端 404）→ 逐商品行打星 + 写文字，一次提交覆盖全部订单行；
 * - 已评价 → 只读展示 + 追评一次。
 *
 * 提交是整单一次（后端要求覆盖全部行，缺行会 400），所以这里不提供「只评一件商品」的出口——
 * 一件一件评会让「好评率」的分母说不清（评了哪件、没评的那件算不算）。
 */
export function ReviewDialog({
    open,
    onOpenChange,
    orderId,
    orderNo,
    items,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    orderId: string
    orderNo?: string
    /** 订单行（逐行打星的对象）；沿用订单详情已有的行形状，不另取一次数 */
    items: OrderItem[]
}) {
    const queryClient = useQueryClient()
    const { data: existing, isPending } = useQuery({ ...myReviewOptions(orderId), enabled: open })

    // 草稿态挂在弹窗里：关掉就丢（半份评价提交出去会 400，见上面的口径）
    const [draft, setDraft] = useState<Record<string, { rating: number; content: string }>>({})
    const [appendText, setAppendText] = useState("")

    useEffect(() => {
        if (open) {
            setDraft({})
            setAppendText("")
        }
    }, [open])

    const submit = useMutation({
        mutationFn: () =>
            ReviewsApi.submitOrderReview({
                path: { orderId },
                body: {
                    items: items.map((line) => ({
                        orderItemId: line.orderItemId,
                        rating: draft[line.orderItemId]?.rating ?? 5,
                        content: draft[line.orderItemId]?.content || undefined,
                    })),
                },
            }),
        meta: { success: "评价已提交", error: "评价提交失败" },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: myReviewKeys.byOrder(orderId) })
            onOpenChange(false)
        },
    })

    const append = useMutation({
        mutationFn: () =>
            ReviewsApi.appendReview({ path: { id: existing!.id }, body: { text: appendText } }),
        meta: { success: "追评已提交", error: "追评提交失败" },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: myReviewKeys.byOrder(orderId) })
            setAppendText("")
        },
    })

    const allRated = items.every((line) => (draft[line.orderItemId]?.rating ?? 0) > 0)

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="max-h-dvh w-full overflow-y-auto sm:max-w-lg">
                <DialogTitle>{existing ? "我的评价" : `评价订单 ${orderNo ?? ""}`}</DialogTitle>

                {isPending ? (
                    <p className="text-sm text-muted-foreground">加载中…</p>
                ) : existing ? (
                    <ReviewDetail
                        review={existing}
                        appendText={appendText}
                        onAppendText={setAppendText}
                        onAppend={() => append.mutate()}
                        appending={append.isPending}
                    />
                ) : (
                    <form
                        className="flex flex-col gap-5"
                        onSubmit={(event) => {
                            event.preventDefault()
                            submit.mutate()
                        }}
                    >
                        {items.map((line) => (
                            <div
                                key={line.orderItemId}
                                className="flex flex-col gap-2 border-b pb-4 last:border-b-0 last:pb-0"
                            >
                                <p className="truncate text-sm font-medium">{line.title}</p>
                                <RatingPicker
                                    name={`rating-${line.orderItemId}`}
                                    value={draft[line.orderItemId]?.rating ?? 0}
                                    onChange={(rating) =>
                                        setDraft((prev) => ({
                                            ...prev,
                                            [line.orderItemId]: {
                                                rating,
                                                content: prev[line.orderItemId]?.content ?? "",
                                            },
                                        }))
                                    }
                                />
                                <Field>
                                    <FieldLabel>评价内容（可留空）</FieldLabel>
                                    <Textarea
                                        maxLength={CONTENT_MAX}
                                        placeholder="说说这件商品怎么样"
                                        value={draft[line.orderItemId]?.content ?? ""}
                                        onChange={(event) =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                [line.orderItemId]: {
                                                    rating: prev[line.orderItemId]?.rating ?? 5,
                                                    content: event.target.value,
                                                },
                                            }))
                                        }
                                    />
                                </Field>
                            </div>
                        ))}
                        <p className="text-xs text-muted-foreground">
                            提交后不可修改；7 天内可追评一次。
                        </p>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                关闭
                            </Button>
                            <Button
                                type="submit"
                                disabled={!allRated || submit.isPending}
                            >
                                {submit.isPending ? "提交中…" : "提交评价"}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}

/** 已提交的评价：只读展示 + 追评入口（追评一次，REV-09） */
function ReviewDetail({
    review,
    appendText,
    onAppendText,
    onAppend,
    appending,
}: {
    review: NonNullable<Awaited<ReturnType<typeof ReviewsApi.getOrderReview>>>
    appendText: string
    onAppendText: (value: string) => void
    onAppend: () => void
    appending: boolean
}) {
    return (
        <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
                提交于 {formatDateTime(review.createdAt)}
            </p>
            <ul className="flex flex-col gap-4">
                {review.items.map((item) => (
                    <li
                        key={item.orderItemId}
                        className="flex flex-col gap-1 border-b pb-3 last:border-b-0"
                    >
                        <div className="flex items-center gap-2">
                            <Stars
                                value={item.rating}
                                label={`${item.rating} 星`}
                            />
                            <span className="truncate text-sm">{item.name}</span>
                        </div>
                        {item.content && <p className="text-sm">{item.content}</p>}
                    </li>
                ))}
            </ul>
            {review.appendText ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">我的追评：</span>
                    {review.appendText}
                </p>
            ) : (
                <Field>
                    <FieldLabel>追评（可追一次，说点补充的）</FieldLabel>
                    <Textarea
                        maxLength={APPEND_MAX}
                        placeholder="用了几天之后再来补一句"
                        value={appendText}
                        onChange={(event) => onAppendText(event.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                        <Button
                            size="sm"
                            disabled={!appendText.trim() || appending}
                            onClick={onAppend}
                        >
                            {appending ? "提交中…" : "提交追评"}
                        </Button>
                    </div>
                </Field>
            )}
            {review.reply && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">卖家回复：</span>
                    {review.reply}
                </p>
            )}
        </div>
    )
}

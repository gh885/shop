import { useEffect, useState } from "react"
import { useT } from "#/locales/use-t"
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
import { formatDateTime } from "@shop/app-kit/display"
import { useI18n } from "@shop/app-kit/i18n"
import { NOTE_MAX } from "@shop/common/domain"
import { myReviewKeys, myReviewOptions } from "./my-review-queries"

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
    const t = useT()
    return (
        <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label={t("web.review.picker.ariaLabel")}
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
                    <span className="sr-only">{t("web.review.stars.srOnly", { rating: n })}</span>
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
    const t = useT()
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
        meta: {
            success: t("web.review.toast.submit.success"),
            error: t("web.review.toast.submit.error"),
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: myReviewKeys.byOrder(orderId) })
            onOpenChange(false)
        },
    })

    const append = useMutation({
        mutationFn: () =>
            ReviewsApi.appendReview({ path: { id: existing!.id }, body: { text: appendText } }),
        meta: {
            success: t("web.review.toast.append.success"),
            error: t("web.review.toast.append.error"),
        },
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
                <DialogTitle>
                    {existing
                        ? t("web.review.dialog.title.existing")
                        : t("web.review.dialog.title.new", { orderNo: orderNo ?? "" })}
                </DialogTitle>

                {isPending ? (
                    <p className="text-sm text-muted-foreground">
                        {t("web.review.dialog.loading")}
                    </p>
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
                                    <FieldLabel>{t("web.review.dialog.content.label")}</FieldLabel>
                                    <Textarea
                                        maxLength={NOTE_MAX}
                                        placeholder={t("web.review.dialog.content.placeholder")}
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
                            {t("web.review.dialog.hint")}
                        </p>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                {t("web.review.dialog.close")}
                            </Button>
                            <Button
                                type="submit"
                                disabled={!allRated || submit.isPending}
                            >
                                {submit.isPending
                                    ? t("web.review.dialog.submit.pending")
                                    : t("web.review.dialog.submit.action")}
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
    const t = useT()
    const { locale } = useI18n()
    return (
        <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
                {t("web.review.detail.submittedAt", {
                    time: formatDateTime(review.createdAt, locale),
                })}
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
                                label={t("web.review.detail.starsLabel", { rating: item.rating })}
                            />
                            <span className="truncate text-sm">{item.name}</span>
                        </div>
                        {item.content && <p className="text-sm">{item.content}</p>}
                    </li>
                ))}
            </ul>
            {review.appendText ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">{t("web.review.detail.myAppend")}</span>
                    {review.appendText}
                </p>
            ) : (
                <Field>
                    <FieldLabel>{t("web.review.detail.append.label")}</FieldLabel>
                    <Textarea
                        maxLength={NOTE_MAX}
                        placeholder={t("web.review.detail.append.placeholder")}
                        value={appendText}
                        onChange={(event) => onAppendText(event.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                        <Button
                            size="sm"
                            disabled={!appendText.trim() || appending}
                            onClick={onAppend}
                        >
                            {appending
                                ? t("web.review.dialog.append.pending")
                                : t("web.review.dialog.append.action")}
                        </Button>
                    </div>
                </Field>
            )}
            {review.reply && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">{t("web.review.detail.sellerReply")}</span>
                    {review.reply}
                </p>
            )}
        </div>
    )
}

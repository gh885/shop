import { message } from "#/locales/message"
import { useEffect, useState } from "react"
import { useT } from "#/locales/use-t"
import { ReviewsApi } from "@shop/api/sdk"
import type { OrderItem } from "#/domains/order"
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
            aria-label={t("review.picker.ariaLabel")}
        >
            {[1, 2, 3, 4, 5].map((n) => (
                <label
                    key={n}
                    className="cursor-pointer p-0.5"
                >
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
                    <span className="sr-only">{t("review.stars.srOnly", { rating: n })}</span>
                </label>
            ))}
        </div>
    )
}

/**
 * 提交是整单一次（后端要求覆盖全部行，缺行会 400），所以这里不提供「只评一件商品」的出口。
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
    items: OrderItem[]
}) {
    const t = useT()
    const queryClient = useQueryClient()
    const { data: existing, isPending } = useQuery({ ...myReviewOptions(orderId), enabled: open })

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
            success: message("review.toast.submit.success"),
            error: message("review.toast.submit.error"),
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
            success: message("review.toast.append.success"),
            error: message("review.toast.append.error"),
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
                        ? t("review.dialog.title.existing")
                        : t("review.dialog.title.new", { orderNo: orderNo ?? "" })}
                </DialogTitle>

                {isPending ? (
                    <p className="text-sm text-muted-foreground">{t("review.dialog.loading")}</p>
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
                                    <FieldLabel>{t("review.dialog.content.label")}</FieldLabel>
                                    <Textarea
                                        maxLength={NOTE_MAX}
                                        placeholder={t("review.dialog.content.placeholder")}
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
                        <p className="text-xs text-muted-foreground">{t("review.dialog.hint")}</p>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                            >
                                {t("review.dialog.close")}
                            </Button>
                            <Button
                                type="submit"
                                disabled={!allRated || submit.isPending}
                            >
                                {submit.isPending
                                    ? t("review.dialog.submit.pending")
                                    : t("review.dialog.submit.action")}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}

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
                {t("review.detail.submittedAt", {
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
                                label={t("review.detail.starsLabel", { rating: item.rating })}
                            />
                            <span className="truncate text-sm">{item.name}</span>
                        </div>
                        {item.content && <p className="text-sm">{item.content}</p>}
                    </li>
                ))}
            </ul>
            {review.appendText ? (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">{t("review.detail.myAppend")}</span>
                    {review.appendText}
                </p>
            ) : (
                <Field>
                    <FieldLabel>{t("review.detail.append.label")}</FieldLabel>
                    <Textarea
                        maxLength={NOTE_MAX}
                        placeholder={t("review.detail.append.placeholder")}
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
                                ? t("review.dialog.append.pending")
                                : t("review.dialog.append.action")}
                        </Button>
                    </div>
                </Field>
            )}
            {review.reply && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">{t("review.detail.sellerReply")}</span>
                    {review.reply}
                </p>
            )}
        </div>
    )
}

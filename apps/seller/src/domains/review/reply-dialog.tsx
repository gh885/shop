import { message } from "#/locales/message"
import { SellerReviewsApi } from "@shop/api/sdk"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"

import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { VALIDATION_RULES } from "@shop/common/contract"
import { NOTE_MAX, withMaxLength } from "@shop/common/domain"
import {
    applyServerFieldErrors,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"
import { useState } from "react"

import { useT } from "#/locales/use-t"
import { reviewKeys } from "./queries"

const ReplySchema = z.object({
    text: withMaxLength(z.string().trim().min(1, { message: VALIDATION_RULES.REQUIRED }), NOTE_MAX),
})

export function ReviewReplyDialog({
    reviewId,
    productName,
    buyerLabel,
}: {
    reviewId: string
    productName: string
    buyerLabel: string
}) {
    const [open, setOpen] = useState(false)
    const t = useT("review")

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
            >
                {t("review.reply.action")}
            </Button>
            <Dialog
                open={open}
                onOpenChange={setOpen}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogTitle>{t("review.reply.dialog.title")}</DialogTitle>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                        {t("review.reply.dialog.subject", {
                            product: productName,
                            buyer: buyerLabel,
                        })}
                    </p>
                    <ReplyForm
                        reviewId={reviewId}
                        onOpenChange={setOpen}
                    />
                </DialogContent>
            </Dialog>
        </>
    )
}

function ReplyForm({
    reviewId,
    onOpenChange,
}: {
    reviewId: string
    onOpenChange: (open: boolean) => void
}) {
    const t = useT("review")
    const reply = useMutation({
        mutationFn: (text: string) =>
            SellerReviewsApi.replyReview({ path: { id: reviewId }, body: { text } }),
        meta: {
            success: message("review.toast.replyPublished"),
            error: message("review.toast.replyFailed"),
            invalidates: [reviewKeys.all],
        },
    })

    const form = useAppForm({
        defaultValues: { text: "" },
        validators: { onSubmit: ReplySchema },
        onSubmit: async ({ value }) => {
            try {
                await reply.mutateAsync(value.text.trim())
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { text: "text" }))
                // 写完字段错误后必须原样抛出：submitForm 靠这个 rejection 收尾，别吞掉
                throw error
            }
            onOpenChange(false)
        },
    })

    return (
        <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(event) => {
                event.preventDefault()
                void submitForm(form)
            }}
        >
            <form.AppField name="text">
                {(field) => (
                    <field.TextareaField
                        label={t("review.reply.form.label")}
                        placeholder={t("review.reply.form.placeholder")}
                        maxLength={NOTE_MAX}
                    />
                )}
            </form.AppField>
            <FormActions
                pending={reply.isPending}
                disableCancel={reply.isPending}
                submitLabel={t("review.reply.form.submit")}
                onCancel={() => onOpenChange(false)}
            />
        </form>
    )
}

import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { Dialog, DialogContent, applyServerFieldErrors, useAppForm } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import type { WebTranslate } from "#/locales/messages.gen"

import { OrderDialogForm } from "./order-dialog-form"

function useReasonOptions(t: WebTranslate) {
    return [
        { value: t("order.cancel.reason.noNeed"), label: t("order.cancel.reason.noNeed") },
        {
            value: t("order.cancel.reason.wrongInfo"),
            label: t("order.cancel.reason.wrongInfo"),
        },
        {
            value: t("order.afterSale.reason.OTHER"),
            label: t("order.afterSale.reason.OTHER"),
        },
    ]
}

const NOTE_MAX_LENGTH = 180

export interface CancelOrderDialogProps {
    order?: { id: string; orderNo: string }
    onOpenChange: (open: boolean) => void
    pending: boolean
    onConfirm: (reason?: string) => Promise<void>
}

export function CancelOrderDialog({ order, onOpenChange, ...props }: CancelOrderDialogProps) {
    return (
        <Dialog
            open={order !== undefined}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                {order && (
                    <CancelForm
                        {...props}
                        orderNo={order.orderNo}
                        onOpenChange={onOpenChange}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}

function CancelForm({
    orderNo,
    onOpenChange,
    pending,
    onConfirm,
}: Omit<CancelOrderDialogProps, "order"> & { orderNo: string }) {
    const t = useT()
    const reasonOptions = useReasonOptions(t)
    const form = useAppForm({
        defaultValues: { reason: "", note: "" },
        onSubmit: async ({ value }) => {
            const reason = [value.reason, value.note.trim()].filter(Boolean).join("：") || undefined
            try {
                await onConfirm(reason)
            } catch (error) {
                applyServerFieldErrors(form, serverFieldErrors(error, { reason: "reason" }))
                throw error
            }
        },
    })

    return (
        <OrderDialogForm
            title={t("order.action.cancel")}
            description={t("order.cancel.description", { orderNo })}
            onSubmit={() => void submitForm(form)}
        >
            <form.AppField name="reason">
                {(field) => (
                    <field.RadioGroupField
                        label={t("order.cancel.reasonLabel")}
                        options={reasonOptions}
                    />
                )}
            </form.AppField>

            <form.AppField name="note">
                {(field) => (
                    <field.TextareaField
                        label={t("order.cancel.noteLabel")}
                        hint={t("order.cancel.noteHint")}
                        maxLength={NOTE_MAX_LENGTH}
                        rows={3}
                        placeholder={t("order.cancel.notePlaceholder")}
                    />
                )}
            </form.AppField>

            <FormActions
                pending={pending}
                cancelLabel={t("order.cancel.dismissLabel")}
                submitLabel={t("order.cancel.submitLabel")}
                onCancel={() => onOpenChange(false)}
            />
        </OrderDialogForm>
    )
}

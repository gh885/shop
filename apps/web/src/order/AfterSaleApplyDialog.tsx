import { z } from "zod"
import { AfterSaleReason, TicketType } from "@shop/api/sdk"
import { Dialog, DialogContent, applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { NOTE_MAX, withMaxLength } from "@shop/common/domain"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useT } from "#/locales/use-t"
import type { WebTranslate } from "#/locales/messages.gen"
import { AFTER_SALE_REASON_ORDER, AFTER_SALE_TYPE_ORDER } from "./constants"
import { afterSaleReasonLabel, afterSaleTypeHint, afterSaleTypeLabel } from "./order-label"
import { OrderDialogForm } from "./order-dialog-form"
import { useApplyAfterSale } from "./after-sale-queries"

const ApplySchema = z.object({
    type: z.enum(TicketType),
    reasonCode: z.enum(AfterSaleReason, { error: "order.err.reasonRequired" }),
    reason: withMaxLength(z.string(), NOTE_MAX),
})

const DEFAULT_VALUES: { type: TicketType; reasonCode: "" | AfterSaleReason; reason: string } = {
    type: TicketType.REFUND_ONLY,
    reasonCode: "",
    reason: "",
}

function useAfterSaleOptions(t: WebTranslate) {
    return {
        typeOptions: AFTER_SALE_TYPE_ORDER.map((type) => ({
            value: type,
            label: afterSaleTypeLabel(type, t),
            description: afterSaleTypeHint(type, t),
        })),
        reasonOptions: AFTER_SALE_REASON_ORDER.map((reasonCode) => ({
            value: reasonCode,
            label: afterSaleReasonLabel(reasonCode, t),
        })),
    }
}

export interface AfterSaleApplyDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    orderId: string
    orderNo: string
}

export function AfterSaleApplyDialog({ open, onOpenChange, ...props }: AfterSaleApplyDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-lg">
                <ApplyForm
                    {...props}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function ApplyForm({ onOpenChange, orderId, orderNo }: Omit<AfterSaleApplyDialogProps, "open">) {
    const apply = useApplyAfterSale(orderId)
    const t = useT()
    const { typeOptions, reasonOptions } = useAfterSaleOptions(t)

    const form = useAppForm({
        defaultValues: DEFAULT_VALUES,
        validators: { onSubmit: ApplySchema },
        onSubmit: async ({ value }) => {
            try {
                await apply.mutateAsync(ApplySchema.parse(value))
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        type: "type",
                        reasonCode: "reasonCode",
                        reason: "reason",
                    }),
                )
                throw error
            }
            onOpenChange(false)
        },
    })

    return (
        <OrderDialogForm
            title={t("order.itemAction.after_sale")}
            description={t("order.afterSale.apply.description", { orderNo })}
            onSubmit={() => void submitForm(form)}
        >
            <form.AppField name="type">
                {(field) => (
                    <field.RadioGroupField
                        label={t("order.afterSale.apply.typeLabel")}
                        required
                        options={typeOptions}
                    />
                )}
            </form.AppField>

            <form.AppField name="reasonCode">
                {(field) => (
                    <field.SelectField
                        label={t("order.afterSale.card.reason")}
                        required
                        items={reasonOptions}
                        hint={t("order.afterSale.apply.reasonHint")}
                    />
                )}
            </form.AppField>

            <form.AppField name="reason">
                {(field) => (
                    <field.TextareaField
                        label={t("order.afterSale.card.note")}
                        placeholder={t("order.afterSale.apply.notePlaceholder")}
                        maxLength={NOTE_MAX}
                        rows={3}
                    />
                )}
            </form.AppField>

            <FormActions
                pending={apply.isPending}
                submitLabel={t("order.afterSale.apply.submitLabel")}
                onCancel={() => onOpenChange(false)}
            />
        </OrderDialogForm>
    )
}

import { useEffect, useState } from "react"
import { z } from "zod"
import { Dialog, DialogContent, Input, applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { NOTE_MAX, formatMoney, withMaxLength } from "@shop/common/domain"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import type { WebTranslate } from "#/locales/messages.gen"
import {
    CASE_REASONS,
    CASE_TYPES,
    defaultRefundQuantities,
    maxRefundQuantity,
    type CaseReason,
    type CaseType,
} from "./after-sale"
import { afterSaleReasonLabel, afterSaleTypeHint, afterSaleTypeLabel } from "./order-label"
import { OrderDialogForm } from "./order-dialog-form"
import { useApplyAfterSale } from "./after-sale-queries"
import type { OrderItem } from "./rules"

const ApplySchema = z.object({
    type: z.enum(CASE_TYPES),
    reasonCode: z.enum(CASE_REASONS, { error: "order.err.reasonRequired" }),
    reason: withMaxLength(z.string(), NOTE_MAX),
})

const DEFAULT_VALUES: { type: CaseType; reasonCode: "" | CaseReason; reason: string } = {
    type: "RETURN_REFUND",
    reasonCode: "",
    reason: "",
}

function useAfterSaleOptions(t: WebTranslate) {
    return {
        typeOptions: CASE_TYPES.map((type) => ({
            value: type,
            label: afterSaleTypeLabel(type, t),
            description: afterSaleTypeHint(type, t),
        })),
        reasonOptions: CASE_REASONS.map((reasonCode) => ({
            value: reasonCode,
            label: afterSaleReasonLabel(reasonCode, t),
        })),
    }
}

export interface AfterSaleApplyDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    sellerOrderId: string
    orderNo: string
    items: OrderItem[]
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

function ApplyForm({
    onOpenChange,
    sellerOrderId,
    orderNo,
    items,
}: Omit<AfterSaleApplyDialogProps, "open">) {
    const apply = useApplyAfterSale()
    const t = useT()
    const { typeOptions, reasonOptions } = useAfterSaleOptions(t)
    const [quantities, setQuantities] = useState<Record<number, number>>({})
    const [linesError, setLinesError] = useState(false)

    const form = useAppForm({
        defaultValues: DEFAULT_VALUES,
        validators: { onSubmit: ApplySchema },
        onSubmit: async ({ value }) => {
            // 行与数量是独立状态（每行一个数字框）：提交前按当前类型的额度收一次，至少一行 > 0
            const lines = items
                .map((item) => ({
                    lineNo: item.lineNo,
                    quantity: Math.min(
                        quantities[item.lineNo] ?? 0,
                        maxRefundQuantity(item, value.type),
                    ),
                }))
                .filter((line) => line.quantity > 0)
            if (lines.length === 0) {
                setLinesError(true)
                return
            }
            setLinesError(false)
            try {
                await apply.mutateAsync({ ...ApplySchema.parse(value), sellerOrderId, lines })
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

            <form.Subscribe selector={(state) => state.values.type}>
                {(type) => (
                    <RefundLines
                        type={type}
                        items={items}
                        quantities={quantities}
                        onChange={setQuantities}
                        linesError={linesError}
                    />
                )}
            </form.Subscribe>

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

/** 逐行数量：切换类型或重新打开时重算默认值（能退几件就填几件，买家改小即可） */
function RefundLines({
    type,
    items,
    quantities,
    onChange,
    linesError,
}: {
    type: CaseType
    items: OrderItem[]
    quantities: Record<number, number>
    onChange: (next: Record<number, number>) => void
    linesError: boolean
}) {
    const t = useT()
    const { locale } = useI18n()

    useEffect(() => {
        onChange(defaultRefundQuantities(items, type))
    }, [items, type, onChange])

    return (
        <div className="space-y-2">
            <p className="text-sm font-medium">{t("order.afterSale.apply.linesLabel")}</p>
            {items.map((item) => {
                const max = maxRefundQuantity(item, type)
                return (
                    <div
                        key={item.lineNo}
                        className="flex items-center justify-between gap-3"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{item.title}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                                {t("order.afterSale.apply.lineRefundable", {
                                    max,
                                    amount: formatMoney(item.amount, locale),
                                })}
                            </p>
                        </div>
                        <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={max}
                            disabled={max === 0}
                            aria-label={t("order.afterSale.apply.quantityOf", {
                                name: item.title,
                            })}
                            className="w-20 text-right tabular-nums"
                            value={quantities[item.lineNo] ?? 0}
                            onChange={(event) =>
                                onChange({
                                    ...quantities,
                                    [item.lineNo]: Math.min(
                                        Math.max(0, Number(event.target.value || 0)),
                                        max,
                                    ),
                                })
                            }
                        />
                    </div>
                )
            })}
            {linesError && (
                <p className="text-xs text-destructive">
                    {t("order.afterSale.apply.linesRequired")}
                </p>
            )}
        </div>
    )
}

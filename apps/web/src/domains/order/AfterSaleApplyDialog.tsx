import { useEffect, useState } from "react"
import { z } from "zod"
import { AfterSaleReason, RefundType } from "@shop/api/sdk"
import { Dialog, DialogContent, Input, applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { NOTE_MAX, formatMoney, withMaxLength } from "@shop/common/domain"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import { useT } from "#/locales/use-t"
import type { WebTranslate } from "#/locales/messages.gen"
import { AFTER_SALE_REASON_ORDER, AFTER_SALE_TYPE_ORDER } from "./constants"
import { afterSaleReasonLabel, afterSaleTypeHint, afterSaleTypeLabel } from "./order-label"
import { OrderDialogForm } from "./order-dialog-form"
import { useApplyAfterSale } from "./after-sale-queries"
import { defaultRefundQuantities, maxRefundQuantity } from "./after-sale"
import type { OrderItem } from "./rules"

const ApplySchema = z.object({
    type: z.enum(RefundType),
    reasonCode: z.enum(AfterSaleReason, { error: "order.err.reasonRequired" }),
    reason: withMaxLength(z.string(), NOTE_MAX),
})

const DEFAULT_VALUES: { type: RefundType; reasonCode: "" | AfterSaleReason; reason: string } = {
    type: RefundType.RETURN_REFUND,
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
    orderId,
    orderNo,
    items,
}: Omit<AfterSaleApplyDialogProps, "open">) {
    const apply = useApplyAfterSale(orderId)
    const t = useT()
    const { typeOptions, reasonOptions } = useAfterSaleOptions(t)
    const [quantities, setQuantities] = useState<Record<string, number>>({})
    const [linesError, setLinesError] = useState(false)

    const form = useAppForm({
        defaultValues: DEFAULT_VALUES,
        validators: { onSubmit: ApplySchema },
        onSubmit: async ({ value }) => {
            // 行与数量是独立状态（每行一个数字框）：提交前按当前类型的额度收一次，至少一行 > 0
            const lines = items
                .map((item) => ({
                    orderItemId: item.orderItemId,
                    quantity: Math.min(
                        quantities[item.orderItemId] ?? 0,
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
                // zod 在 onSubmit 已过一遍；这里再 parse 一次是为了把 reasonCode 的 "" 排除掉（类型收窄）
                await apply.mutateAsync({ ...ApplySchema.parse(value), lines })
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

            {/* 额度随类型变（仅退款退未发件、退货退款退已发件）：订阅表单值，别读 form.state——那不会触发重渲染 */}
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
    type: RefundType
    items: OrderItem[]
    quantities: Record<string, number>
    onChange: (next: Record<string, number>) => void
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
                        key={item.orderItemId}
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
                            value={quantities[item.orderItemId] ?? 0}
                            onChange={(event) =>
                                onChange({
                                    ...quantities,
                                    [item.orderItemId]: Math.min(
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

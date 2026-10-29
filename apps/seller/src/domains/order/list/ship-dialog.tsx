import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import type { OrderIdentity } from "./table"
import { TRACKING_NO_MAX } from "@shop/common/domain"
import { serverFieldErrors, submitForm, FormActions } from "@shop/app-kit/forms"
import { useT } from "#/locales/use-t"
import {
    applyServerFieldErrors,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Field,
    FieldLabel,
    Input,
    Skeleton,
    useAppForm,
} from "@shop/ui-web"

import { orderDetailOptions } from "#/domains/order/queries"
import {
    CARRIERS,
    defaultShipQuantities,
    remainingQuantity,
    ShipSchema,
    shipInputFromForm,
    shipLinesFromQuantities,
    type ShipInput,
} from "#/domains/order/list/ship-form"

/**
 * 发货弹窗。列表只给摘要（金额/状态），行级可发量要按订单 id 拉详情——
 * 摘要行没有 `lines`，在列表里塞整行等于每页 20 次 N+1。
 */
export function ShipDialog({
    open,
    order,
    onOpenChange,
    onShip,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    order?: OrderIdentity
    onShip: (orderId: string, input: ShipInput) => Promise<unknown> | void
}) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-md">
                {order && (
                    <ShipForm
                        // 换单要重挂：行数量是本地状态，用上一单的剩余量初始化会串味
                        key={order.sellerOrderId}
                        order={order}
                        onOpenChange={onOpenChange}
                        onShip={onShip}
                    />
                )}
            </DialogContent>
        </Dialog>
    )
}

function ShipForm({
    order,
    onOpenChange,
    onShip,
}: {
    order: OrderIdentity
    onOpenChange: (open: boolean) => void
    onShip: (orderId: string, input: ShipInput) => Promise<unknown> | void
}) {
    const detail = useQuery(orderDetailOptions(order.sellerOrderId))
    const t = useT()
    const lines = detail.data?.lines ?? []

    // 发量不走表单校验：每行一个数字框，默认发完剩余量，改哪行算哪行。
    // 详情到达后以详情行为准重建一次（列表没有行，初值只能是空的）
    const [quantities, setQuantities] = useState<Record<number, number>>(() =>
        defaultShipQuantities(lines),
    )
    const [linesError, setLinesError] = useState<string>()
    const [syncedLines, setSyncedLines] = useState(lines)

    // 详情到达时同步一次初值：用「同一份 lines 引用」判断，避免每次渲染都重置用户改动
    if (detail.data && syncedLines !== detail.data.lines) {
        setSyncedLines(detail.data.lines)
        setQuantities(defaultShipQuantities(detail.data.lines))
    }

    const form = useAppForm({
        defaultValues: { carrierCode: "", trackingNo: "" },
        validators: { onSubmit: ShipSchema },
        onSubmit: async ({ value }) => {
            const items = shipLinesFromQuantities(lines, quantities)
            if (items.length === 0) {
                setLinesError(t("order.ship.lines.empty"))
                return
            }
            setLinesError(undefined)
            // onShip 由容器持有 mutation 并透出结果：await 失败不关窗，422 字段级明细落到对应输入框
            try {
                await onShip(order.sellerOrderId, shipInputFromForm(value, items))
            } catch (error) {
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        carrierCode: "carrierCode",
                        trackingNo: "trackingNo",
                    }),
                )
                throw error
            }
            onOpenChange(false)
        },
    })

    return (
        <>
            <DialogHeader>
                <DialogTitle>{t("order.ship.title")}</DialogTitle>
            </DialogHeader>
            <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submitForm(form)
                }}
            >
                <div className="text-sm">
                    <span className="text-muted-foreground">{t("order.ship.orderNoLabel")}</span>
                    <span className="font-medium tabular-nums">{order.orderNo}</span>
                </div>

                <Field>
                    <FieldLabel>{t("order.ship.lines.label")}</FieldLabel>
                    {detail.isPending ? (
                        <Skeleton className="h-20 w-full rounded-lg" />
                    ) : (
                        <div className="space-y-2">
                            {lines.map((line) => {
                                const remaining = remainingQuantity(line)
                                return (
                                    <div
                                        key={line.lineNo}
                                        className="flex items-center justify-between gap-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm">{line.title}</p>
                                            <p className="text-xs text-muted-foreground tabular-nums">
                                                {t("order.ship.lines.remaining", {
                                                    quantity: remaining,
                                                })}
                                            </p>
                                        </div>
                                        <Input
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            max={remaining}
                                            disabled={remaining === 0}
                                            aria-label={t("order.ship.lines.quantityOf", {
                                                name: line.title,
                                            })}
                                            className="w-20 text-right tabular-nums"
                                            value={quantities[line.lineNo] ?? 0}
                                            onChange={(e) =>
                                                setQuantities((prev) => ({
                                                    ...prev,
                                                    [line.lineNo]: Number(e.target.value || 0),
                                                }))
                                            }
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    )}
                    {linesError && <p className="text-sm text-destructive">{linesError}</p>}
                </Field>

                <form.AppField name="carrierCode">
                    {(field) => (
                        <field.SelectField
                            label={t("order.ship.carrier.label")}
                            required
                            placeholder={t("order.ship.carrier.placeholder")}
                            items={[...CARRIERS]}
                        />
                    )}
                </form.AppField>
                <form.AppField name="trackingNo">
                    {(field) => (
                        <field.TextField
                            label={t("order.ship.tracking.label")}
                            required
                            maxLength={TRACKING_NO_MAX}
                            placeholder={t("order.ship.tracking.placeholder")}
                        />
                    )}
                </form.AppField>
                <FormActions
                    submitLabel={t("order.ship.submit")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}

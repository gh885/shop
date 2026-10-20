import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import type { OrderIdentity } from "./table"
import { TRACKING_NO_MAX } from "@shop/common/domain"
import { toApiError } from "@shop/common/contract"
import { errorText, useI18n } from "@shop/app-kit/i18n"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useT } from "#/locales/use-t"
import {
    applyServerFieldErrors,
    Button,
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

import { carrierListOptions } from "#/domains/order/queries"
import {
    carrierSelectItems,
    defaultShipQuantities,
    remainingQuantity,
    ShipSchema,
    shipInputFromForm,
    shipLinesFromQuantities,
    type ShipInput,
} from "#/domains/order/list/ship-form"

interface ShipDraft {
    shipmentId: string
    carrierName: string
    trackingNo: string
}

/**
 * 从 409 的结构化 params 里取回「待交寄发货单」的定位：三个值缺一不可（id 用来操作，另两个给卖家
 * 确认是哪张单）。形状不对返回 undefined——其余错误照旧只走字段红字与全局提示。
 */
function pendingDraftOf(error: unknown): ShipDraft | undefined {
    const err = toApiError(error)
    if (err.status !== 409) return undefined
    const { shipmentId, carrierName, trackingNo } = err.params ?? {}
    if (
        typeof shipmentId !== "string" ||
        typeof carrierName !== "string" ||
        typeof trackingNo !== "string"
    ) {
        return undefined
    }
    return { shipmentId, carrierName, trackingNo }
}

export function ShipDialog({
    open,
    order,
    onOpenChange,
    onShip,
    onResolveDraft,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    order?: OrderIdentity
    onShip: (orderId: string, input: ShipInput) => Promise<unknown> | void
    onResolveDraft: (action: "dispatch" | "cancel", shipmentId: string) => Promise<unknown> | void
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
                        key={order.id}
                        order={order}
                        onOpenChange={onOpenChange}
                        onShip={onShip}
                        onResolveDraft={onResolveDraft}
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
    onResolveDraft,
}: {
    order: OrderIdentity
    onOpenChange: (open: boolean) => void
    onShip: (orderId: string, input: ShipInput) => Promise<unknown> | void
    onResolveDraft: (action: "dispatch" | "cancel", shipmentId: string) => Promise<unknown> | void
}) {
    const carriers = useQuery(carrierListOptions())
    const { locale } = useI18n()
    const t = useT()
    // 发量不走表单校验：每行一个数字框，默认发完剩余量，改哪行算哪行
    const [quantities, setQuantities] = useState(() => defaultShipQuantities(order.items))
    const [linesError, setLinesError] = useState<string>()
    // 「已有待发货单」的恢复态（来自 409 的结构化 params）：横幅在，主提交照常可用
    const [draft, setDraft] = useState<ShipDraft>()
    const [resolving, setResolving] = useState(false)

    const form = useAppForm({
        defaultValues: { carrierCode: "", trackingNo: "" },
        validators: { onSubmit: ShipSchema },
        onSubmit: async ({ value }) => {
            setDraft(undefined)
            const lines = shipLinesFromQuantities(order.items, quantities)
            if (lines.length === 0) {
                setLinesError(t("order.ship.lines.empty"))
                return
            }
            setLinesError(undefined)
            // onShip 由容器持有 mutation 并透出结果：await 失败不关窗，422 字段级明细落到对应输入框
            try {
                await onShip(order.id, shipInputFromForm(value, lines))
            } catch (error) {
                // DTO 的 orderId 由容器拼进请求、表单无对应框，故不进 map
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, {
                        carrierCode: "carrierCode",
                        trackingNo: "trackingNo",
                    }),
                )
                // 「已有待发货单」的 409 带结构化 params：切到恢复横幅。没有它卖家会撞死——
                // UI 没有别的交寄/取消入口，重试只会拿到同一句 409
                setDraft(pendingDraftOf(error))
                throw error
            }
            onOpenChange(false)
        },
    })

    // 恢复动作：交寄既有发货单成功即关窗；取消成功后留在弹窗，卖家按当前表单重新提交即可
    async function resolveDraft(action: "dispatch" | "cancel") {
        if (!draft) return
        setResolving(true)
        try {
            await onResolveDraft(action, draft.shipmentId)
            if (action === "dispatch") {
                onOpenChange(false)
            } else {
                setDraft(undefined)
            }
        } catch {
            // 全局 MutationCache 已提示（后端 detail 优先）；横幅保持，卖家可换个动作再试
        } finally {
            setResolving(false)
        }
    }

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
                    <div className="space-y-2">
                        {order.items.map((item) => {
                            const remaining = remainingQuantity(item)
                            return (
                                <div
                                    key={item.orderItemId}
                                    className="flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm">{item.name}</p>
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
                                            name: item.name,
                                        })}
                                        className="w-20 text-right tabular-nums"
                                        value={quantities[item.orderItemId] ?? 0}
                                        onChange={(e) =>
                                            setQuantities((prev) => ({
                                                ...prev,
                                                [item.orderItemId]: Number(e.target.value || 0),
                                            }))
                                        }
                                    />
                                </div>
                            )
                        })}
                    </div>
                    {linesError && <p className="text-sm text-destructive">{linesError}</p>}
                </Field>

                {carriers.isPending ? (
                    <Field>
                        <FieldLabel>{t("order.ship.carrier.label")}</FieldLabel>
                        <Skeleton className="h-8 w-full rounded-lg" />
                    </Field>
                ) : carriers.isError ? (
                    <Field>
                        <FieldLabel>{t("order.ship.carrier.label")}</FieldLabel>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-destructive">
                                {errorText(
                                    toApiError(carriers.error),
                                    locale,
                                    t("common.loadFailed.carriers"),
                                )}
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={carriers.isFetching}
                                onClick={() => void carriers.refetch()}
                            >
                                {t("ui.stateError.retry")}
                            </Button>
                        </div>
                    </Field>
                ) : carriers.data.length === 0 ? (
                    <Field>
                        <FieldLabel>{t("order.ship.carrier.label")}</FieldLabel>
                        <p className="text-sm text-muted-foreground">
                            {t("order.ship.carrier.empty")}
                        </p>
                    </Field>
                ) : (
                    <form.AppField name="carrierCode">
                        {(field) => (
                            <field.SelectField
                                label={t("order.ship.carrier.label")}
                                required
                                placeholder={t("order.ship.carrier.placeholder")}
                                items={carrierSelectItems(carriers.data)}
                            />
                        )}
                    </form.AppField>
                )}
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
                {draft && (
                    <div className="space-y-3 rounded-lg bg-warning-subtle px-4 py-3">
                        <p className="text-sm text-warning-subtle-foreground">
                            {t("order.ship.draft.notice", {
                                carrier: draft.carrierName,
                                trackingNo: draft.trackingNo,
                            })}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                size="sm"
                                disabled={resolving}
                                onClick={() => void resolveDraft("dispatch")}
                            >
                                {t("order.ship.draft.dispatch")}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={resolving}
                                onClick={() => void resolveDraft("cancel")}
                            >
                                {t("order.ship.draft.cancel")}
                            </Button>
                        </div>
                    </div>
                )}
                <FormActions
                    submitLabel={t("order.ship.submit")}
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}

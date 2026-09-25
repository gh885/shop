import { z } from "zod"
import { useQuery } from "@tanstack/react-query"

import type { OrderIdentity } from "./table"
import { TRACKING_NO_MAX, toApiError, TrackingNoSchema } from "@shop/common"
import { FormActions } from "@shop/app-kit"
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    Field,
    FieldLabel,
    Skeleton,
    useAppForm,
} from "@shop/ui-web"

import { carrierListOptions } from "#/order/queries"

/** 承运商走字典 code；运单号首尾空格清掉，承运商推送按运单号精确匹配（口径见 @shop/common 的 tracking.ts） */
const ShipSchema = z.object({
    carrierCode: z.string().min(1, "请选择快递公司"),
    trackingNo: TrackingNoSchema,
})

/**
 * 卖家发货弹窗：选承运商（字典下拉）+ 填运单号。提交经 onShip 上抛（mutation 在容器持有）。
 *
 * <p>承运商是自由文本升级来的：同一个顺丰曾能写出五种字，落库后既没法统计也没法对接物流商接口，
 * 现在只传字典 code，展示名由后端按字典归一（规则见 docs/business-rules/logistics.md LOG-70）。
 * 字典是弹窗自己拉的——加载/失败态就地渲染，不必让调用方认识"快递公司还没到"这件事。
 * 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，打开即重置。
 */
export function ShipDialog({
    open,
    order,
    onOpenChange,
    onShip,
}: {
    open: boolean
    /** 本弹窗只读 id（请求）与单号（展示），不背整行订单 */
    order?: OrderIdentity
    onOpenChange: (open: boolean) => void
    onShip: (orderId: string, input: { carrierCode: string; trackingNo: string }) => void
}) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            {/* max-w 基底已由 ui-web 的 DialogContent 提供（含 max-w-[calc(100%-2rem)]），这里只覆盖 sm: 档 */}
            <DialogContent className="sm:max-w-md">
                {order && (
                    <ShipForm
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
    onShip: (orderId: string, input: { carrierCode: string; trackingNo: string }) => void
}) {
    const carriers = useQuery(carrierListOptions())

    const form = useAppForm({
        defaultValues: { carrierCode: "", trackingNo: "" },
        validators: { onSubmit: ShipSchema },
        onSubmit: ({ value }) => {
            onShip(order.id, {
                carrierCode: value.carrierCode,
                trackingNo: value.trackingNo.trim(),
            })
            onOpenChange(false)
        },
    })

    return (
        <>
            <DialogHeader>
                <DialogTitle>发货</DialogTitle>
            </DialogHeader>
            <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
            >
                <div className="text-sm">
                    <span className="text-muted-foreground">订单号：</span>
                    <span className="font-medium tabular-nums">{order.orderNo}</span>
                </div>
                {carriers.isPending ? (
                    <Field>
                        <FieldLabel>快递公司</FieldLabel>
                        <Skeleton className="h-8 w-full rounded-lg" />
                    </Field>
                ) : carriers.isError ? (
                    <Field>
                        <FieldLabel>快递公司</FieldLabel>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-destructive">
                                {toApiError(carriers.error).detail}
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={carriers.isFetching}
                                onClick={() => void carriers.refetch()}
                            >
                                重试
                            </Button>
                        </div>
                    </Field>
                ) : carriers.data.length === 0 ? (
                    <Field>
                        <FieldLabel>快递公司</FieldLabel>
                        <p className="text-sm text-muted-foreground">
                            暂无可选快递公司，请联系平台维护字典
                        </p>
                    </Field>
                ) : (
                    <form.AppField name="carrierCode">
                        {(field) => (
                            <field.SelectField
                                label="快递公司"
                                required
                                placeholder="选择快递公司"
                                items={carriers.data.map((c) => ({ value: c.code, label: c.name }))}
                            />
                        )}
                    </form.AppField>
                )}
                <form.AppField name="trackingNo">
                    {(field) => (
                        <field.TextField
                            label="运单号"
                            required
                            maxLength={TRACKING_NO_MAX}
                            placeholder="快递运单号"
                        />
                    )}
                </form.AppField>
                <FormActions
                    submitLabel="发货"
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}

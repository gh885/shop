import { z } from "zod"
import { CARRIER_NAME_MAX, TRACKING_NO_MAX, TrackingNoSchema } from "@shop/common"
import { FormActions } from "@shop/app-kit"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    useAppForm,
} from "@shop/ui-web"

import { useReturnAfterSale } from "./after-sale-queries"

/**
 * 回寄退货弹窗：先看寄到哪，再填快递公司 + 运单号。
 *
 * 退货地址吃售后详情下发的 returnAddress（查询时实时解析的卖家默认退货地址）：
 * null 时不挡提交——地址缺失是卖家侧配置问题，单号登记本身仍是买家该做的事，
 * 但要直说「先联系客服」，别让买家凭「请把商品寄回」四个字猜目的地。
 *
 * 这一步只落物流单（售后单状态不变）：后端把它登记成 logistics 的 RETURN 包裹，
 * 之后承运商推送、轮询兜底、买家「查看物流」都自动认得它——所以这里填错/填漏要能改，
 * 表单体挂在 DialogContent 里（BaseUI 关闭即卸载），每次打开都按现有值回填，允许覆盖：
 * 先撤单再申请会拿到新的空值，改单会拿到上一次填的号。
 *
 * 快递公司是手输而不是字典下拉：买家回寄是线下行为，他手上只有面单上的名字，
 * 强制从字典里选只会把人挡在门外（后端按名字匹配字典，匹配不上也照实记）。
 */

/** 表单入参校验：三个上限取自 @shop/common 的运单口径，与后端词表、库上列宽同源（见 tracking.ts） */
const ReturnSchema = z.object({
    logisticsCompany: z
        .string()
        .trim()
        .min(1, "请填写快递公司")
        .max(CARRIER_NAME_MAX, `快递公司最长 ${CARRIER_NAME_MAX} 字`),
    trackingNo: TrackingNoSchema,
})

export interface AfterSaleReturnDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    orderId: string
    /** 已有回寄单则回填（允许改） */
    defaultLogisticsCompany?: string | null
    defaultTrackingNo?: string | null
    /**
     * 卖家默认退货地址（一行串，来自售后详情 returnAddress）。
     * undefined = 详情还没拿到（不渲染引导区）；null = 卖家未配置（渲染联系客服提示）。
     */
    returnAddress?: string | null
}

export function AfterSaleReturnDialog({
    open,
    onOpenChange,
    ...props
}: AfterSaleReturnDialogProps) {
    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-md">
                <ReturnForm
                    {...props}
                    onOpenChange={onOpenChange}
                />
            </DialogContent>
        </Dialog>
    )
}

function ReturnForm({
    onOpenChange,
    orderId,
    defaultLogisticsCompany,
    defaultTrackingNo,
    returnAddress,
}: Omit<AfterSaleReturnDialogProps, "open">) {
    const submitReturn = useReturnAfterSale(orderId)

    const form = useAppForm({
        defaultValues: {
            logisticsCompany: defaultLogisticsCompany ?? "",
            trackingNo: defaultTrackingNo ?? "",
        },
        validators: { onSubmit: ReturnSchema },
        // 同申请弹窗：失败由 mutation 的 onError 统一提示，这里不 await 一个必然 reject 的 promise
        onSubmit: ({ value }) => {
            submitReturn.mutate(value, { onSuccess: () => onOpenChange(false) })
        },
    })

    return (
        <>
            <DialogHeader>
                <DialogTitle>填写退货物流</DialogTitle>
                <DialogDescription>
                    卖家同意退货后，请把商品寄回并在此登记运单号，方便卖家查收。
                </DialogDescription>
            </DialogHeader>

            <form
                className="mt-4 flex flex-col gap-4"
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
            >
                {/* 回寄引导：有地址就给一行（寄错的代价比多读一行字高得多）；null 不编地址，直说联系客服 */}
                {returnAddress !== undefined && (
                    <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                        {returnAddress ? (
                            <>
                                <span className="text-muted-foreground">请把商品寄回以下地址</span>
                                <p className="mt-1 font-medium text-foreground">{returnAddress}</p>
                            </>
                        ) : (
                            <span className="text-muted-foreground">
                                卖家未设置退货地址，请先联系客服
                            </span>
                        )}
                    </div>
                )}

                <form.AppField name="logisticsCompany">
                    {(field) => (
                        <field.TextField
                            label="快递公司"
                            required
                            placeholder="例如：顺丰速运"
                            maxLength={CARRIER_NAME_MAX}
                        />
                    )}
                </form.AppField>

                <form.AppField name="trackingNo">
                    {(field) => (
                        <field.TextField
                            label="运单号"
                            required
                            placeholder="面单上的运单号"
                            maxLength={TRACKING_NO_MAX}
                        />
                    )}
                </form.AppField>

                <FormActions
                    pending={submitReturn.isPending}
                    submitLabel="提交"
                    onCancel={() => onOpenChange(false)}
                />
            </form>
        </>
    )
}

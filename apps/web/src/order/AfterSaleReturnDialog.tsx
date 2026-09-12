import { useEffect } from "react"
import { z } from "zod"
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Spinner,
    useAppForm,
} from "@shop/ui-web"

import { useReturnAfterSale } from "./after-sale-queries"

/**
 * 回寄退货弹窗：填快递公司 + 运单号。
 *
 * 这一步只落物流单（售后单状态不变）：后端把它登记成 logistics 的 RETURN 包裹，
 * 之后承运商推送、轮询兜底、买家「查看物流」都自动认得它——所以这里填错/填漏要能改，
 * 弹窗每次都按现有值回填，允许覆盖。
 *
 * 快递公司是手输而不是字典下拉：买家回寄是线下行为，他手上只有面单上的名字，
 * 强制从字典里选只会把人挡在门外（后端按名字匹配字典，匹配不上也照实记，见 ReturnGoodsRequest）。
 */

/** 表单入参校验（与后端 @Size 对齐；表单局部 schema，非领域契约） */
const ReturnSchema = z.object({
    logisticsCompany: z.string().trim().min(1, "请填写快递公司").max(50, "快递公司最长 50 字"),
    trackingNo: z.string().trim().min(1, "请填写运单号").max(64, "运单号最长 64 字"),
})

export interface AfterSaleReturnDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    orderId: string
    /** 已有回寄单则回填（允许改） */
    defaultLogisticsCompany?: string | null
    defaultTrackingNo?: string | null
}

export function AfterSaleReturnDialog({
    open,
    onOpenChange,
    orderId,
    defaultLogisticsCompany,
    defaultTrackingNo,
}: AfterSaleReturnDialogProps) {
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

    // 每次打开都按最新值回填：先撤单再申请会拿到新的空值，改单会拿到上一次填的号
    useEffect(() => {
        if (!open) return
        form.reset({
            logisticsCompany: defaultLogisticsCompany ?? "",
            trackingNo: defaultTrackingNo ?? "",
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultLogisticsCompany, defaultTrackingNo])

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
        >
            <DialogContent className="sm:max-w-md">
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
                    <form.AppField name="logisticsCompany">
                        {(field) => (
                            <field.TextField
                                label="快递公司"
                                required
                                placeholder="例如：顺丰速运"
                                maxLength={50}
                            />
                        )}
                    </form.AppField>

                    <form.AppField name="trackingNo">
                        {(field) => (
                            <field.TextField
                                label="运单号"
                                required
                                placeholder="面单上的运单号"
                                maxLength={64}
                            />
                        )}
                    </form.AppField>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            取消
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitReturn.isPending}
                        >
                            {submitReturn.isPending && <Spinner />}提交
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

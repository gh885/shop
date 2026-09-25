import { z } from "zod"
import { AfterSaleReason, TicketType } from "@shop/api/sdk"
import { Dialog, DialogContent, useAppForm } from "@shop/ui-web"

import { NOTE_MAX } from "@shop/common"
import { FormActions } from "@shop/app-kit"

import {
    AFTER_SALE_REASON_LABEL,
    AFTER_SALE_REASON_ORDER,
    AFTER_SALE_TYPE_HINT,
    AFTER_SALE_TYPE_LABEL,
    AFTER_SALE_TYPE_ORDER,
} from "./constants"
import { OrderDialogForm } from "./order-dialog-form"
import { useApplyAfterSale } from "./after-sale-queries"

/**
 * 申请售后弹窗：选类型（货留不留）+ 选原因 + 补一句说明。
 *
 * 两类售后对买家的承诺完全不同（仅退款=不用寄回，退货退款=要寄回），所以类型用带说明的单选，
 * 不用下拉——把「要不要寄回」这句话摆在选择项里，比选完再解释便宜。
 * 原因是枚举且必选（它决定卖家能不能拒绝这一单，见 constants 的 AFTER_SALE_REASON_LABEL），
 * 自由文本只是补充说明：可空，空串按没填处理。
 * 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，每次打开都回到默认值。
 */

/** 表单入参校验（与后端 @Size(max = 200) 对齐；表单局部 schema，非领域契约） */
const ApplySchema = z.object({
    type: z.enum(TicketType),
    reasonCode: z.enum(AfterSaleReason, { error: "请选择售后原因" }),
    reason: z.string().max(NOTE_MAX, `补充说明最长 ${NOTE_MAX} 字`),
})

/** 默认选「仅退款」：更轻的那条路先给，要寄回得自己切过去（两项各有说明，切错成本低）；原因没有默认值（必选） */
const DEFAULT_VALUES: { type: TicketType; reasonCode: "" | AfterSaleReason; reason: string } = {
    type: TicketType.REFUND_ONLY,
    reasonCode: "",
    reason: "",
}

const TYPE_OPTIONS = AFTER_SALE_TYPE_ORDER.map((type) => ({
    value: type,
    label: AFTER_SALE_TYPE_LABEL[type],
    description: AFTER_SALE_TYPE_HINT[type],
}))

const REASON_OPTIONS = AFTER_SALE_REASON_ORDER.map((reasonCode) => ({
    value: reasonCode,
    label: AFTER_SALE_REASON_LABEL[reasonCode],
}))

export interface AfterSaleApplyDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    orderId: string
    /** 订单号，给弹窗一句「在申请哪个单」的上下文 */
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

    const form = useAppForm({
        defaultValues: DEFAULT_VALUES,
        validators: { onSubmit: ApplySchema },
        // 用 mutate 而不是 mutateAsync：失败已在 mutation 的 onError 里统一提示（notify.fromError），
        // 这里再 await 一个必然 reject 的 promise 只会得到一个没人接的 unhandled rejection
        onSubmit: ({ value }) => {
            // 校验的单一真相源是 ApplySchema，这里按它再收一次类型（reasonCode 的默认值是空串，
            // 表单类型里就是 `"" | AfterSaleReason`）。走不到抛：onSubmit 校验先拦在提交之前。
            apply.mutate(ApplySchema.parse(value), { onSuccess: () => onOpenChange(false) })
        },
    })

    return (
        <OrderDialogForm
            title="申请售后"
            description={`订单号 ${orderNo}。提交后由卖家处理，处理前你可以随时撤销。`}
            onSubmit={() => void form.handleSubmit()}
        >
            <form.AppField name="type">
                {(field) => (
                    <field.RadioGroupField
                        label="售后类型"
                        required
                        options={TYPE_OPTIONS}
                    />
                )}
            </form.AppField>

            <form.AppField name="reasonCode">
                {(field) => (
                    <field.SelectField
                        label="售后原因"
                        required
                        items={REASON_OPTIONS}
                        hint="退货退款在收到商品七天内选「七天无理由退货」，卖家不可拒绝受理"
                    />
                )}
            </form.AppField>

            <form.AppField name="reason">
                {(field) => (
                    <field.TextareaField
                        label="补充说明"
                        placeholder="再补一句细节，便于卖家判断（选填）"
                        maxLength={NOTE_MAX}
                        rows={3}
                    />
                )}
            </form.AppField>

            <FormActions
                pending={apply.isPending}
                submitLabel="提交申请"
                onCancel={() => onOpenChange(false)}
            />
        </OrderDialogForm>
    )
}

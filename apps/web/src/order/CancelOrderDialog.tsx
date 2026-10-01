import { FormActions, serverFieldErrorTexts, submitForm } from "@shop/app-kit/forms"
import { useI18n } from "@shop/app-kit/i18n"
import { Dialog, DialogContent, applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { OrderDialogForm } from "./order-dialog-form"

/**
 * 取消订单弹窗：选一个快捷原因（可跳过不选）+ 自填备注，替代原先的全局二次确认。
 *
 * 后端 reason 是自由文本（可空、最长 200 字），这里不造枚举映射——提交的就是
 * 「选项文案（：备注）」这一句话，超时关单等系统文案仍由后端自己写。
 * 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，换单/重开都是一份干净的本地状态。
 */

/** 快捷原因：产品拍板的三项；「其他」也照实发送，配合备注给客服留线索 */
const REASON_OPTIONS = ["不想买了", "信息填错", "其他"].map((reason) => ({
    value: reason,
    label: reason,
}))

/** 备注封顶：留出「原因：」拼接与最长选项的长度，保证整体不超后端 @Size(max=200) */
const NOTE_MAX_LENGTH = 180

export interface CancelOrderDialogProps {
    /** 待取消的单（含 id 与展示用单号）；未传 = 关闭 */
    order?: { id: string; orderNo: string }
    onOpenChange: (open: boolean) => void
    /** 取消请求进行中：确认按钮转圈并禁用 */
    pending: boolean
    /** 确认取消：reason 为快捷原因 + 备注拼好的自由文本，一个都没填则不给占位文案。
     *  返回请求的 promise，好让表单就地 await 接住后端 422 的字段级错误（详见 CancelForm） */
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
    const { locale } = useI18n()
    const form = useAppForm({
        defaultValues: { reason: "", note: "" },
        onSubmit: async ({ value }) => {
            const reason = [value.reason, value.note.trim()].filter(Boolean).join("：") || undefined
            try {
                await onConfirm(reason)
            } catch (error) {
                // 取消原因（拼好的自由文本）唯一映射到后端的 reason 字段；note 是本地拆分项、无对边
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, { reason: "reason" }),
                )
                throw error
            }
        },
    })

    return (
        <OrderDialogForm
            title="取消订单"
            description={`订单号 ${orderNo}。该操作不可恢复；待发货订单取消后将退款到原支付账户。`}
            onSubmit={() => void submitForm(form)}
        >
            <form.AppField name="reason">
                {(field) => (
                    <field.RadioGroupField
                        label="取消原因（选填）"
                        options={REASON_OPTIONS}
                    />
                )}
            </form.AppField>

            <form.AppField name="note">
                {(field) => (
                    <field.TextareaField
                        label="备注"
                        hint="补充说明（选填），如「地址填错了想改单」"
                        maxLength={NOTE_MAX_LENGTH}
                        rows={3}
                        placeholder="想对卖家说的话（选填）"
                    />
                )}
            </form.AppField>

            <FormActions
                pending={pending}
                cancelLabel="再想想"
                submitLabel="确认取消"
                onCancel={() => onOpenChange(false)}
            />
        </OrderDialogForm>
    )
}

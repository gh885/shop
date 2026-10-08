import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { Dialog, DialogContent, applyServerFieldErrors, useAppForm } from "@shop/ui-web"
import { useT } from "#/locales/use-t"
import type { WebTranslate } from "#/locales/messages.gen"

import { OrderDialogForm } from "./order-dialog-form"

/**
 * 取消订单弹窗：选一个快捷原因（可跳过不选）+ 自填备注，替代原先的全局二次确认。
 *
 * 后端 reason 是自由文本（可空、最长 200 字），这里不造枚举映射——提交的就是
 * 「选项文案（：备注）」这一句话，超时关单等系统文案仍由后端自己写。
 * 表单体挂在 DialogContent 里：BaseUI 关闭即卸载，换单/重开都是一份干净的本地状态。
 */

/**
 * 快捷原因在组件内现建（原来是模块级常量）：后端 reason 是自由文本，提交的「选项文案」就是买家看见的那句，
 * 所以 value 与 label 同源（都取当前语言的句子），换语言后发出去的原因文本也跟着换——这与迁移前
 * value=label=中文常量一致，只是常量换成了 `t()`。三项是产品拍板（含「其他」，配合备注给客服留线索）。
 * 「其他」复用 `order.afterSale.reason.OTHER`：同一条「其他」不另写一份，换语言两处一起动。
 */
function useReasonOptions(t: WebTranslate) {
    return [
        { value: t("order.cancel.reason.noNeed"), label: t("order.cancel.reason.noNeed") },
        {
            value: t("order.cancel.reason.wrongInfo"),
            label: t("order.cancel.reason.wrongInfo"),
        },
        {
            value: t("order.afterSale.reason.OTHER"),
            label: t("order.afterSale.reason.OTHER"),
        },
    ]
}

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
    const t = useT()
    const reasonOptions = useReasonOptions(t)
    const form = useAppForm({
        defaultValues: { reason: "", note: "" },
        onSubmit: async ({ value }) => {
            const reason = [value.reason, value.note.trim()].filter(Boolean).join("：") || undefined
            try {
                await onConfirm(reason)
            } catch (error) {
                // 取消原因（拼好的自由文本）唯一映射到后端的 reason 字段；note 是本地拆分项、无对边
                applyServerFieldErrors(form, serverFieldErrors(error, { reason: "reason" }))
                throw error
            }
        },
    })

    return (
        <OrderDialogForm
            title={t("order.action.cancel")}
            description={t("order.cancel.description", { orderNo })}
            onSubmit={() => void submitForm(form)}
        >
            <form.AppField name="reason">
                {(field) => (
                    <field.RadioGroupField
                        label={t("order.cancel.reasonLabel")}
                        options={reasonOptions}
                    />
                )}
            </form.AppField>

            <form.AppField name="note">
                {(field) => (
                    <field.TextareaField
                        label={t("order.cancel.noteLabel")}
                        hint={t("order.cancel.noteHint")}
                        maxLength={NOTE_MAX_LENGTH}
                        rows={3}
                        placeholder={t("order.cancel.notePlaceholder")}
                    />
                )}
            </form.AppField>

            <FormActions
                pending={pending}
                cancelLabel={t("order.cancel.dismissLabel")}
                submitLabel={t("order.cancel.submitLabel")}
                onCancel={() => onOpenChange(false)}
            />
        </OrderDialogForm>
    )
}

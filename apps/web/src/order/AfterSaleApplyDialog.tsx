import { z } from "zod"
import { AfterSaleReason, TicketType } from "@shop/api/sdk"
import { Dialog, DialogContent, applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { NOTE_MAX, withMaxLength } from "@shop/common/domain"
import { FormActions, serverFieldErrors, submitForm } from "@shop/app-kit/forms"
import { useT } from "#/locales/use-t"
import type { WebTranslate } from "#/locales/messages.gen"
import { AFTER_SALE_REASON_ORDER, AFTER_SALE_TYPE_ORDER } from "./constants"
import { afterSaleReasonLabel, afterSaleTypeHint, afterSaleTypeLabel } from "./order-label"
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

/**
 * 表单入参校验（与后端 @Size(max = 200) 对齐；表单局部 schema，非领域契约）。
 *
 * 消息只发 catalog key（§6.1，与本仓 zod 本地校验同一条链路）：模块级 schema 拿不到 `useT`，
 * 所以这里把 key 当事实发出，句子在渲染边界（ui-web `FieldError` → `FormErrorTranslateProvider`）
 * 按当前语言换出来——参照 `apps/web/src/address/address-form.ts`（`.min(1, { message: VALIDATION_RULES.REQUIRED })`
 * + `err("web.address.err.regionRequired")`）。`reason` 的上限走 `withMaxLength`：那条 `refine` 通道会带出
 * `{max}` 参数，而 `.max(N, msg)` 的 check 通道会把参数丢掉、句子落回裸 `{max}`（长度规则头注释记着这条实测）。
 */
const ApplySchema = z.object({
    type: z.enum(TicketType),
    reasonCode: z.enum(AfterSaleReason, { error: "web.order.err.reasonRequired" }),
    reason: withMaxLength(z.string(), NOTE_MAX),
})

/** 默认选「仅退款」：更轻的那条路先给，要寄回得自己切过去（两项各有说明，切错成本低）；原因没有默认值（必选） */
const DEFAULT_VALUES: { type: TicketType; reasonCode: "" | AfterSaleReason; reason: string } = {
    type: TicketType.REFUND_ONLY,
    reasonCode: "",
    reason: "",
}

/**
 * 两个选项表**在组件内**现建（原来是模块级常量）：它们的 label 是句子，而句子要 `t()`——
 * 模块级拿不到语言（§3.5 约束 2，那条约束本来就是为这种表写的）。
 * `AFTER_SALE_TYPE_ORDER` / `AFTER_SALE_REASON_ORDER` 仍是模块级：那是**顺序**，换语言不变。
 */
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
    const t = useT()
    const { typeOptions, reasonOptions } = useAfterSaleOptions(t)

    const form = useAppForm({
        defaultValues: DEFAULT_VALUES,
        validators: { onSubmit: ApplySchema },
        // mutateAsync + 就地 catch：成功后关窗，失败时把后端 422 的字段级明细落到对应框上
        // （type/reasonCode/reason 三个同名，逐个列进白名单），再原样抛出交给 submitForm 兜住
        onSubmit: async ({ value }) => {
            // 校验的单一真相源是 ApplySchema，这里按它再收一次类型（reasonCode 的默认值是空串，
            // 表单类型里就是 `"" | AfterSaleReason`）。走不到抛：onSubmit 校验先拦在提交之前。
            try {
                await apply.mutateAsync(ApplySchema.parse(value))
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
            title={t("web.order.itemAction.after_sale")}
            description={t("web.order.afterSale.apply.description", { orderNo })}
            onSubmit={() => void submitForm(form)}
        >
            <form.AppField name="type">
                {(field) => (
                    <field.RadioGroupField
                        label={t("web.order.afterSale.apply.typeLabel")}
                        required
                        options={typeOptions}
                    />
                )}
            </form.AppField>

            <form.AppField name="reasonCode">
                {(field) => (
                    <field.SelectField
                        label={t("web.order.afterSale.card.reason")}
                        required
                        items={reasonOptions}
                        hint={t("web.order.afterSale.apply.reasonHint")}
                    />
                )}
            </form.AppField>

            <form.AppField name="reason">
                {(field) => (
                    <field.TextareaField
                        label={t("web.order.afterSale.card.note")}
                        placeholder={t("web.order.afterSale.apply.notePlaceholder")}
                        maxLength={NOTE_MAX}
                        rows={3}
                    />
                )}
            </form.AppField>

            <FormActions
                pending={apply.isPending}
                submitLabel={t("web.order.afterSale.apply.submitLabel")}
                onCancel={() => onOpenChange(false)}
            />
        </OrderDialogForm>
    )
}

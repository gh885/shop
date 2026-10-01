import { applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { FormActions } from "./form-actions"
import { useI18n } from "./i18n"
import { reasonSchemaOf } from "./reason-schema"
import { type ServerFieldMap, serverFieldErrorTexts } from "./server-field-errors"
import { submitForm } from "./submit-form"

/** 本表单自己的值形状（只有一个框，但它同时是 `serverFields` 的约束目标） */
interface ReasonFormValues {
    reason: string
}

/**
 * 自由文本「理由」表单（拒绝/驳回那一类）。
 *
 * 后端 422 的字段级明细**在这里收口**而不是在每个调用点接线：这条通道的形状在所有调用点都一模一样
 * （一个 `reason` 框、一句 `@NotBlank`/`@Size` 的话），逐点重复一遍就会有点漏——而漏掉的那一处
 * 用户只看到一句全局 toast，不知道是哪个框、为什么。调用点只需（少数情况）声明服务端路径与自家框的
 * 对应关系，默认同名。
 */
export function ReasonForm({
    pending = false,
    maxLength,
    label,
    placeholder,
    submitLabel,
    serverFields,
    onCancel,
    onSubmit,
}: {
    pending?: boolean
    maxLength?: number
    label: string
    placeholder: string
    submitLabel: string
    /**
     * 服务端字段路径 → 本表单字段名（`{ 服务端: 表单 }`，白名单：没列的路径不落红）。
     * 不给则按同名处理——现有两个调用点（售后拒绝 AFS-30 的 `RejectAfterSaleRequest`、
     * 入驻驳回的 `RejectRequest`）的 DTO 字段都叫 `reason`，谁都不用传。
     */
    serverFields?: ServerFieldMap<ReasonFormValues>
    onCancel: () => void
    /**
     * 提交动作。**返回 promise 时它的 rejection 会落回 `reason` 那个框**（422 的字段级明细），
     * 然后原样抛出交给 `submitForm`；同步 fire-and-forget 的调用点拿不到错误，那条通道不亮。
     */
    onSubmit: (reason: string) => Promise<unknown> | void
}) {
    const { locale } = useI18n()
    const schema = reasonSchemaOf(label, maxLength)
    const form = useAppForm({
        defaultValues: { reason: "" },
        validators: { onSubmit: schema },
        onSubmit: async ({ value }) => {
            try {
                await onSubmit(value.reason.trim())
            } catch (error) {
                // 只负责「把字段级错误写到框上」然后原样抛出：抛出才让 form-core 的
                // isSubmitSuccessful 回到 false，接住 rejection 是 submitForm 的事
                applyServerFieldErrors(
                    form,
                    serverFieldErrorTexts(error, locale, serverFields ?? { reason: "reason" }),
                )
                throw error
            }
        },
    })
    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
                event.preventDefault()
                // 不写 void form.handleSubmit()：void 不接 rejection，抛出的错误会变成未处理的异步异常
                void submitForm(form)
            }}
        >
            <form.AppField name="reason">
                {(field) => (
                    <field.TextareaField
                        aria-label={label}
                        placeholder={placeholder}
                        rows={3}
                        maxLength={maxLength}
                    />
                )}
            </form.AppField>
            <FormActions
                pending={pending}
                destructive
                submitLabel={submitLabel}
                onCancel={onCancel}
            />
        </form>
    )
}

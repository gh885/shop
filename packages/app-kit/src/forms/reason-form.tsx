import { applyServerFieldErrors, useAppForm } from "@shop/ui-web"

import { FormActions } from "./form-actions"
import { reasonSchemaOf } from "./reason-schema"
import { type ServerFieldMap, serverFieldErrors } from "./server-field-errors"
import { submitForm } from "./submit-form"

/** 本表单的值形状，同时是 `serverFields` 的约束目标 */
interface ReasonFormValues {
    reason: string
}

/**
 * 后端 422 字段级明细在这里收口（非每个调用点接线）：漏接的那处用户只看到全局 toast，不知哪个框、为什么
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
    serverFields?: ServerFieldMap<ReasonFormValues>
    onCancel: () => void
    onSubmit: (reason: string) => Promise<unknown> | void
}) {
    const schema = reasonSchemaOf(label, maxLength)
    const form = useAppForm({
        defaultValues: { reason: "" },
        validators: { onSubmit: schema },
        onSubmit: async ({ value }) => {
            try {
                await onSubmit(value.reason.trim())
            } catch (error) {
                // 只写框、原样抛出：抛出才让 isSubmitSuccessful 回 false，接住 rejection 是 submitForm 的事
                applyServerFieldErrors(
                    form,
                    serverFieldErrors(error, serverFields ?? { reason: "reason" }),
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

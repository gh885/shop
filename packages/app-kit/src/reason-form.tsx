import { useAppForm } from "@shop/ui-web"

import { FormActions } from "./form-actions"
import { reasonSchemaOf } from "./reason-schema"

export function ReasonForm({
    pending = false,
    maxLength,
    label,
    placeholder,
    submitLabel,
    onCancel,
    onSubmit,
}: {
    pending?: boolean
    maxLength?: number
    label: string
    placeholder: string
    submitLabel: string
    onCancel: () => void
    onSubmit: (reason: string) => void
}) {
    const schema = reasonSchemaOf(label, maxLength)
    const form = useAppForm({
        defaultValues: { reason: "" },
        validators: { onSubmit: schema },
        onSubmit: ({ value }) => onSubmit(value.reason.trim()),
    })
    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
                event.preventDefault()
                void form.handleSubmit()
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

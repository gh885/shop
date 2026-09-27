import { useId } from "react"

import { Field, FieldLabel, Input } from "@shop/ui-web"

import { FEE_TIER_FIELDS } from "../constants"
import type { FeeTierFormValue } from "../model"

export function FeeTierInputs({
    value,
    onChange,
}: {
    value: FeeTierFormValue
    onChange: (value: FeeTierFormValue) => void
}) {
    const id = useId()
    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {FEE_TIER_FIELDS.map((tier) => (
                <Field key={tier.key}>
                    <FieldLabel
                        htmlFor={id + tier.key}
                        required
                    >
                        {tier.label}
                    </FieldLabel>
                    <Input
                        id={id + tier.key}
                        value={value[tier.key]}
                        inputMode={tier.inputMode}
                        onChange={(event) => onChange({ ...value, [tier.key]: event.target.value })}
                    />
                </Field>
            ))}
        </div>
    )
}

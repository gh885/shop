import { useId } from "react"

import { Field, FieldLabel, Input } from "@shop/ui-web"

import type { FeeTierFormValue } from "../model"

const TIERS = [
    { key: "firstQuantity", label: "首件（件）", inputMode: "numeric" },
    { key: "firstFee", label: "首费（元）", inputMode: "decimal" },
    { key: "addQuantity", label: "续件（件）", inputMode: "numeric" },
    { key: "addFee", label: "续费（元）", inputMode: "decimal" },
] as const

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
            {TIERS.map((tier) => (
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

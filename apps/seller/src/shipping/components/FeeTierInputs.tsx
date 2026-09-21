import { FieldShell, Input } from "@shop/ui-web"

import type { FeeTierFormValue } from "../model"

export function FeeTierInputs({
    value,
    onChange,
}: {
    value: FeeTierFormValue
    onChange: (value: FeeTierFormValue) => void
}) {
    function patch<Key extends keyof FeeTierFormValue>(key: Key, next: FeeTierFormValue[Key]) {
        onChange({ ...value, [key]: next })
    }

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <FieldShell
                label="首件（件）"
                required
            >
                <Input
                    value={value.firstQuantity}
                    inputMode="numeric"
                    onChange={(event) => patch("firstQuantity", event.target.value)}
                />
            </FieldShell>
            <FieldShell
                label="首费（元）"
                required
            >
                <Input
                    value={value.firstFee}
                    inputMode="decimal"
                    onChange={(event) => patch("firstFee", event.target.value)}
                />
            </FieldShell>
            <FieldShell
                label="续件（件）"
                required
            >
                <Input
                    value={value.addQuantity}
                    inputMode="numeric"
                    onChange={(event) => patch("addQuantity", event.target.value)}
                />
            </FieldShell>
            <FieldShell
                label="续费（元）"
                required
            >
                <Input
                    value={value.addFee}
                    inputMode="decimal"
                    onChange={(event) => patch("addFee", event.target.value)}
                />
            </FieldShell>
        </div>
    )
}

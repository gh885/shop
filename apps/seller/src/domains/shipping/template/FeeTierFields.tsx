import { useT } from "#/locales/use-t"

import { FEE_TIER_FIELDS } from "../constants"
import type { FeeTierPrefix, ShippingForm } from "../form-instance"

// 字段 path 里数组段必须方括号（regionRules[2].xxx）：点号写法取不到键，错误红字落不进格子
export function FeeTierFields({ form, prefix }: { form: ShippingForm; prefix: FeeTierPrefix }) {
    const t = useT()
    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {FEE_TIER_FIELDS.map((tier) => (
                <form.AppField
                    key={tier.key}
                    name={`${prefix}.${tier.key}`}
                >
                    {(field) => (
                        <field.TextField
                            label={t(tier.labelKey)}
                            required
                            inputMode={tier.inputMode}
                        />
                    )}
                </form.AppField>
            ))}
        </div>
    )
}

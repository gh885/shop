import { useT } from "#/locales/use-t"

import { FEE_TIER_FIELDS } from "../constants"
import type { FeeTierPrefix, ShippingForm } from "../form-instance"

/**
 * 运费档四格（首件 / 首费 / 续件 / 续费），每格都是**真的表单字段**。
 *
 * 迁移前它是一个受控组件（`value` / `onChange` 收整档对象），于是那一格不在字段表里：
 * 校验出错时错误只能挂在整块上，页面底部一句话，用户看不出是哪个框。
 * 换成逐格 `AppField` 后，schema 给的 `path`（`defaultRule.firstFee` / `regionRules[2].addQuantity`）
 * 直接落进对应那格的红字里——**数组段必须写方括号**，点号写法取不到键（i18n.md §6.1）。
 */
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

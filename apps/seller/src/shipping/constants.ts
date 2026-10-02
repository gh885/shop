import type { FeeTierFormValue } from "./model"
import type { SellerMessageKey } from "#/locales/messages.gen"

/**
 * 运费档四格（首件 / 首费 / 续件 / 续费）：摆哪一格、给人看的那句话、敲数字还是小数。
 *
 * 纯展示数据——「件数必须是 ≥1 的整数」「金额按元填、提交换算成分」这些**规则**住在 model.ts
 * （parseQuantity / parseFee），这里只决定四格怎么画。
 * key 钉在 `FeeTierFormValue` 的键上：表单形状一改，这一格编译期就报错，
 * 而不是画出一个读不到值、也写不回值的空输入框。
 */
/**
 * 四格是**字段名**（labelKey）而不是句子：文案归 catalog（`seller.shipping.tier.*`）。
 * 「（件）/（元）」那个单位后缀跟着句子走——中文写在标签里，英文那边 units 已经被 label
 * 自己的 "items"/"amount" 说清了，再挂一个括号单位就成了 "First items (items)"。
 */
export const FEE_TIER_FIELDS: readonly {
    key: keyof FeeTierFormValue
    labelKey: SellerMessageKey
    inputMode: "numeric" | "decimal"
}[] = [
    { key: "firstQuantity", labelKey: "seller.shipping.tier.firstQuantity", inputMode: "numeric" },
    { key: "firstFee", labelKey: "seller.shipping.tier.firstFee", inputMode: "decimal" },
    { key: "addQuantity", labelKey: "seller.shipping.tier.addQuantity", inputMode: "numeric" },
    { key: "addFee", labelKey: "seller.shipping.tier.addFee", inputMode: "decimal" },
]

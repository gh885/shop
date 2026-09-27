import type { FeeTierFormValue } from "./model"

/**
 * 运费档四格（首件 / 首费 / 续件 / 续费）：摆哪一格、给人看的那句话、敲数字还是小数。
 *
 * 纯展示数据——「件数必须是 ≥1 的整数」「金额按元填、提交换算成分」这些**规则**住在 model.ts
 * （parseQuantity / parseFee），这里只决定四格怎么画。
 * key 钉在 `FeeTierFormValue` 的键上：表单形状一改，这一格编译期就报错，
 * 而不是画出一个读不到值、也写不回值的空输入框。
 */
export const FEE_TIER_FIELDS: readonly {
    key: keyof FeeTierFormValue
    label: string
    inputMode: "numeric" | "decimal"
}[] = [
    { key: "firstQuantity", label: "首件（件）", inputMode: "numeric" },
    { key: "firstFee", label: "首费（元）", inputMode: "decimal" },
    { key: "addQuantity", label: "续件（件）", inputMode: "numeric" },
    { key: "addFee", label: "续费（元）", inputMode: "decimal" },
]

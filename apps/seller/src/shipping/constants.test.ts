import { describe, expect, it } from "vite-plus/test"

import { FEE_TIER_FIELDS } from "./constants"
import { EMPTY_FEE_TIER } from "./model"

/**
 * 运费档四格表与表单形状是否还严丝合缝。
 *
 * 这一格漏一格的后果不报错：多出来的字段没有输入框（永远停在默认值），
 * 少了的字段读不到值（显示成空白）。形状改动只有编译期与这条断言会说话。
 */
describe("FEE_TIER_FIELDS", () => {
    it("覆盖 FeeTierFormValue 的每一个字段，一个不多一个不少", () => {
        expect(new Set(FEE_TIER_FIELDS.map((field) => field.key))).toEqual(
            new Set(Object.keys(EMPTY_FEE_TIER)),
        )
    })

    it("顺序是「首件 → 首费 → 续件 → 续费」：数量在前金额在后，两档并排读得顺", () => {
        expect(FEE_TIER_FIELDS.map((field) => field.key)).toEqual([
            "firstQuantity",
            "firstFee",
            "addQuantity",
            "addFee",
        ])
    })

    it("件数量的是整数、金额要能敲小数：inputMode 决定移动端弹哪套键盘", () => {
        expect(
            FEE_TIER_FIELDS.filter((field) => field.inputMode === "decimal").map((f) => f.key),
        ).toEqual(["firstFee", "addFee"])
    })
})

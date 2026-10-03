import { VALIDATION_RULES } from "@shop/common/contract"
import { describe, expect, it } from "vite-plus/test"

import { SHOP_NAME_MAX } from "#/shop/constants"

import { CreateShopFormSchema } from "./shop-form"

/**
 * 店名那一格的行为：长度上限与那条事实里的数必须是同一个数。
 *
 * 上限由 Java 侧词表核对（FieldRuleVocabularyTest 读的就是 SHOP_NAME_MAX），这里核的是前端这一格
 * 真的按它拦人。但比的是**结构化事实**（catalog key + `{max}` 数据）而不是中文句子——句子住在
 * catalog，由渲染边界按当前语言换出来（§6.1）；在这里断言中文，就等于把 locale 焊回 schema。
 */

/** 校验失败时交出去的事实（通过时是空数组）；`params` 只在 `custom` 那条 issue 上存在 */
function issues(name: string): { message: string; params?: Record<string, unknown> }[] {
    const parsed = CreateShopFormSchema.safeParse({ name })
    if (parsed.success) return []
    return parsed.error.issues.map((issue) => ({
        message: issue.message,
        ...(issue.code === "custom" ? { params: issue.params } : {}),
    }))
}

describe("CreateShopFormSchema", () => {
    it("空着与只有空格都是「必填」那条事实：空格不算一个店名", () => {
        expect(issues("").map((issue) => issue.message)).toEqual([VALIDATION_RULES.REQUIRED])
        expect(issues("   ").map((issue) => issue.message)).toEqual([VALIDATION_RULES.REQUIRED])
    })

    it("上限那一格与 SHOP_NAME_MAX 相等：整格放行，多一字拒绝，且上限是数据不是句子的一部分", () => {
        expect(issues("店".repeat(SHOP_NAME_MAX))).toEqual([])
        expect(issues("店".repeat(SHOP_NAME_MAX + 1))).toEqual([
            { message: VALIDATION_RULES.MAX_LENGTH, params: { max: SHOP_NAME_MAX } },
        ])
    })

    it("首尾空白不计入长度，交出去的名字也已经 trim 过", () => {
        const parsed = CreateShopFormSchema.safeParse({
            name: `  ${"店".repeat(SHOP_NAME_MAX)}  `,
        })

        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.name).toBe("店".repeat(SHOP_NAME_MAX))
    })
})

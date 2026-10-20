import { VALIDATION_RULES } from "@shop/common/contract"
import { describe, expect, it } from "vite-plus/test"

import { SHOP_NAME_MAX } from "#/domains/shop/constants"

import { CreateShopFormSchema } from "./shop-form"

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

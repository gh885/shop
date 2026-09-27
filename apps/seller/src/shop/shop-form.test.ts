import { describe, expect, it } from "vitest"

import { SHOP_NAME_MAX } from "#/shop/constants"

import { CreateShopFormSchema } from "./shop-form"

/**
 * 店名那一格的行为：长度上限与那句提示必须是同一个数。
 *
 * 上限由 Java 侧词表核对（FieldRuleVocabularyTest 读的就是 SHOP_NAME_MAX），
 * 这里核的是前端这一格真的按它拦人，并且报出来的那句话不说谎。
 */

/** 校验失败时用户会看到的句子（通过时是空数组） */
function issues(name: string): string[] {
    const parsed = CreateShopFormSchema.safeParse({ name })
    return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)
}

describe("CreateShopFormSchema", () => {
    it("空着与只有空格都是「请输入店铺名称」：空格不算一个店名", () => {
        expect(issues("")).toEqual(["请输入店铺名称"])
        expect(issues("   ")).toEqual(["请输入店铺名称"])
    })

    it("上限那一格与 SHOP_NAME_MAX 相等：整格放行，多一字拒绝", () => {
        expect(issues("店".repeat(SHOP_NAME_MAX))).toEqual([])
        expect(issues("店".repeat(SHOP_NAME_MAX + 1))).toEqual([`店名最长 ${SHOP_NAME_MAX} 字`])
    })

    it("首尾空白不计入长度，交出去的名字也已经 trim 过", () => {
        const parsed = CreateShopFormSchema.safeParse({ name: `  ${"店".repeat(SHOP_NAME_MAX)}  ` })

        expect(parsed.success).toBe(true)
        expect(parsed.success && parsed.data.name).toBe("店".repeat(SHOP_NAME_MAX))
    })
})

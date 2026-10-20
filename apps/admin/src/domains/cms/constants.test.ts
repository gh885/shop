import { NavRequestSchema } from "@shop/api/schemas"
import { describe, expect, it } from "vite-plus/test"

import { TARGET_TYPE_ITEMS, TARGET_TYPES } from "./constants"

describe("跳转类型词表", () => {
    it("与契约那格 pattern 同源：Java 侧加了类型而这里没跟，当场红", () => {
        expect(TARGET_TYPES.join("|")).toBe(NavRequestSchema.properties.targetType.pattern)
    })

    it("NONE 也在下拉选项里且排第一：默认态是「不跳转」，不是「猜一个」", () => {
        expect(TARGET_TYPE_ITEMS[0]).toEqual({
            value: "NONE",
            labelKey: "cms.targetType.NONE",
        })
        expect(TARGET_TYPE_ITEMS.map((i) => i.value)).toContain("PRODUCT")
    })
})

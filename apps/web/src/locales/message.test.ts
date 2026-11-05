import { describe, expect, it } from "vite-plus/test"
import { translateWeb } from "./index"
import { message } from "./message"

describe("catalog 消息事实", () => {
    it("提交订单使用与组件结构无关的完整语义 key", () => {
        expect(message("checkout.placeOrder")).toEqual({ message: "checkout.placeOrder" })
        expect(translateWeb("checkout.placeOrder", "zh-Hans-CN")).toBe("提交订单")
        expect(translateWeb("checkout.placeOrder", "en-US")).toBe("Place order")
    })
})

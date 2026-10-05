import { describe, expect, it } from "vite-plus/test"
import { message } from "./message"

function invalidCalls() {
    // @ts-expect-error 拼错 key 必须在调用处失败
    message("missing.notification.key")
    // @ts-expect-error 本端消息的参数不可省略
    message("web.cart.toast.maxStock")
    // @ts-expect-error 参数名称必须匹配本端 catalog
    message("web.cart.toast.maxStock", { wrong: 1 })
    // @ts-expect-error 共享 catalog 也不能省略参数
    message("appKit.login.resend")
    // @ts-expect-error 无参消息不接受额外参数
    message("appKit.copy.plain", { label: "字段" })
}

describe("catalog 消息事实", () => {
    it("本端与共享参数在构造处检查，不提前翻译", () => {
        expect(message("web.cart.toast.maxStock", { stock: "3" })).toEqual({
            message: "web.cart.toast.maxStock",
            params: { stock: "3" },
        })
        expect(message("appKit.login.resend", { countdown: 3 })).toEqual({
            message: "appKit.login.resend",
            params: { countdown: 3 },
        })
    })
    it("保留编译期反例，但不执行非法调用", () => {
        expect(invalidCalls).toBeTypeOf("function")
    })
})

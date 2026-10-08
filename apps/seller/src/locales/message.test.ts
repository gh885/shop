import { describe, expect, it } from "vite-plus/test"
import { message } from "./message"

function invalidCalls() {
    // @ts-expect-error 拼错 key 必须在调用处失败
    message("missing.notification.key")
    // @ts-expect-error 本端消息的参数不可省略
    message("coupon.form.err.nameMax")
    // @ts-expect-error 参数名称必须匹配本端 catalog
    message("coupon.form.err.nameMax", { wrong: 1 })
    // @ts-expect-error 共享 catalog 也不能省略参数
    message("login.resend")
    // @ts-expect-error 无参消息不接受额外参数
    message("copy.plain", { label: "字段" })
}

describe("catalog 消息事实", () => {
    it("本端与共享参数在构造处检查，不提前翻译", () => {
        expect(message("coupon.form.err.nameMax", { max: "3" })).toEqual({
            message: "coupon.form.err.nameMax",
            params: { max: "3" },
        })
        expect(message("login.resend", { countdown: 3 })).toEqual({
            message: "login.resend",
            params: { countdown: 3 },
        })
    })
    it("保留编译期反例，但不执行非法调用", () => {
        expect(invalidCalls).toBeTypeOf("function")
    })
})

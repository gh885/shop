import { describe, expect, it } from "vite-plus/test"
import type { WebTranslate, WebScopedT } from "./messages.gen"

function acceptsOnlyValidCalls(t: WebTranslate, scoped: WebScopedT<"cart">) {
    t("app.title")
    t("web.cart.toolbar.confirmRemove.description", { count: 2 })
    // @ts-expect-error ICU 参数必须提供
    t("web.cart.toolbar.confirmRemove.description")
    // @ts-expect-error 共享字典同样要求参数
    t("appKit.login.resend")
    // @ts-expect-error namespace 收窄不能绕过必传参数
    scoped("web.cart.toolbar.confirmRemove.description")
    // @ts-expect-error 无参 key 不接收参数
    t("app.title", { count: 2 })
    // @ts-expect-error 参数名必须匹配 ICU
    t("web.cart.toolbar.confirmRemove.description", { total: 2 })
}

describe("generated ICU parameter types", () => {
    it("keeps negative compilation probes reachable without running invalid calls", () => {
        expect(acceptsOnlyValidCalls).toBeTypeOf("function")
    })
})

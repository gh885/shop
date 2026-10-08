import { describe, expect, it, vi } from "vite-plus/test"
import { createI18n, localeOf, translate, type I18nResources } from "./message"
import { captureError } from "../monitoring"
vi.mock("../monitoring", () => ({ captureError: vi.fn<typeof captureError>() }))
const resources: I18nResources = {
    "zh-Hans-CN": { greeting: "你好，{name}", items: "{count} 件商品", bad: "{oops" },
    "en-US": {
        greeting: "Hello, {name}",
        onlyEn: "English",
        items: "{count, plural, =0 {No items} one {# item} other {# items}}",
    },
}
describe("i18next + ICU application contract", () => {
    it("initializes synchronously and resolves shared resources and fallback", () => {
        const i18n = createI18n(resources, "zh-Hans-CN", { "en-US": { shared: "Shared" } })
        expect(i18n.isInitialized).toBe(true)
        expect(translate(i18n, "greeting", { name: "Shop" })).toBe("你好，Shop")
        expect(translate(i18n, "onlyEn")).toBe("English")
        expect(translate(i18n, "shared")).toBe("Shared")
    })
    it("passes parameters to ICU, including plural and null values", () => {
        const i18n = createI18n(resources, "en-US")
        expect(translate(i18n, "items", { count: 0 })).toBe("No items")
        expect(translate(i18n, "items", { count: 1 })).toBe("1 item")
        expect(translate(i18n, "items", { count: 3 })).toBe("3 items")
        expect(translate(i18n, "greeting", { name: null })).toBe("Hello, ")
    })
    it("never exposes unformatted ICU, and distinguishes missing key/param/invalid message", () => {
        const i18n = createI18n(resources)
        expect(translate(i18n, "unknown")).toBe("unknown")
        expect(translate(i18n, "greeting")).toBe("greeting")
        expect(translate(i18n, "bad")).toBe("bad")
        expect(captureError).toHaveBeenCalledWith("i18n_missing_key", null, { message: "unknown" })
        expect(captureError).toHaveBeenCalledWith("i18n_missing_param", null, {
            message: "greeting",
        })
        expect(captureError).toHaveBeenCalledWith("i18n_invalid_message", null, { message: "bad" })
    })
    it("keeps concurrent request instances independent across awaits", async () => {
        const zh = createI18n(resources, "zh-Hans-CN")
        const en = createI18n(resources, "en-US")
        const result = await Promise.all(
            [zh, en].map(async (instance) => {
                await Promise.resolve()
                return translate(instance, "greeting", { name: "Shop" })
            }),
        )
        expect(result).toEqual(["你好，Shop", "Hello, Shop"])
        expect(translate(zh, "greeting", { name: "Shop" }, "en-US")).toBe("Hello, Shop")
        expect(localeOf(zh)).toBe("zh-Hans-CN")
    })
})

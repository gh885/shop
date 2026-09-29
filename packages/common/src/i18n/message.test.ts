import { describe, expect, it } from "vite-plus/test"

import { formatMessage, isMessageValid, resolveMessage, type I18nResources } from "./message"
import type { AppLocale } from "./locale"

const resources: I18nResources = {
    "zh-CN": {
        "common.greeting": "你好，{name}",
        "common.items": "{count, plural, =0 {没有商品} other {# 件商品}}",
        "common.role": "{role, select, buyer {买家} seller {卖家} other {其他}}",
    },
    "en-US": {
        "common.greeting": "Hello, {name}",
        "common.items": "{count, plural, =0 {No items} one {# item} other {# items}}",
        "common.role": "{role, select, buyer {Buyer} seller {Seller} other {Other}}",
    },
}

/** 取模板：拿不到就当场失败，不给断言喂 `undefined`（也不靠 `!` 蒙过去） */
function templateOf(catalogs: I18nResources, locale: AppLocale, key: string): string {
    const template = resolveMessage(catalogs, key, locale)
    if (template === undefined) throw new Error(`catalog 缺 ${locale} 的 ${key}`)
    return template
}

describe("resolveMessage", () => {
    it("uses the current locale first", () => {
        expect(resolveMessage(resources, "common.greeting", "en-US")).toBe("Hello, {name}")
    })

    it("falls back along the chain: a key only zh-CN has still resolves for en-US", () => {
        const partial: I18nResources = {
            "zh-CN": { "order.only.zh": "已发货" },
            "en-US": {},
        }

        expect(resolveMessage(partial, "order.only.zh", "en-US")).toBe("已发货")
    })

    it("returns undefined when no locale in the fallback chain has the key", () => {
        expect(resolveMessage(resources, "missing.in.en", "en-US")).toBeUndefined()
    })
})

describe("formatMessage", () => {
    it("interpolates simple params", () => {
        expect(formatMessage("你好，{name}", { name: "小明" }, "zh-CN")).toBe("你好，小明")
    })

    it('null and undefined params render as empty string, not "null"', () => {
        expect(formatMessage("你好，{name}", { name: null }, "zh-CN")).toBe("你好，")
    })

    /**
     * §10.2：这几条测的不是 ICU parser 对不对（那是 intl-messageformat 自己的职责），
     * 而是 locale 有没有真的传到 formatter、我们有没有把库接对。
     */
    it("locale drives plural category selection", () => {
        const template = "{count, plural, one {# item} other {# items}}"
        expect(formatMessage(template, { count: 1 }, "en-US")).toBe("1 item")
        expect(formatMessage(template, { count: 5 }, "en-US")).toBe("5 items")
        // 中文没有单复数变化：同一个模板在 zh-CN 下一律走 other
        expect(formatMessage(template, { count: 1 }, "zh-CN")).toBe("1 items")
    })

    it("formats the exact-match and other branches from the catalog", () => {
        expect(
            formatMessage(templateOf(resources, "en-US", "common.items"), { count: 0 }, "en-US"),
        ).toBe("No items")
        expect(
            formatMessage(templateOf(resources, "en-US", "common.items"), { count: 3 }, "en-US"),
        ).toBe("3 items")
        expect(
            formatMessage(templateOf(resources, "zh-CN", "common.items"), { count: 0 }, "zh-CN"),
        ).toBe("没有商品")
        expect(
            formatMessage(templateOf(resources, "zh-CN", "common.items"), { count: 7 }, "zh-CN"),
        ).toBe("7 件商品")
    })

    it("replaces select categories", () => {
        const template = "{role, select, buyer {Buyer} seller {Seller} other {Other}}"
        expect(formatMessage(template, { role: "seller" }, "en-US")).toBe("Seller")
        expect(formatMessage(template, { role: "guest" }, "en-US")).toBe("Other")
    })

    /** §5.1 契约 1 + 2：坏 ICU 不抛错，降级成原样模板（t() 那层再降级成 key） */
    it("returns the template instead of throwing when the ICU is malformed", () => {
        const broken = "{count, plural, one {# item"
        expect(isMessageValid(broken, "en-US")).toBe(false)
        expect(() => formatMessage(broken, { count: 1 }, "en-US")).not.toThrow()
        expect(formatMessage(broken, { count: 1 }, "en-US")).toBe(broken)
    })

    it("does not throw when a referenced param is missing", () => {
        expect(() => formatMessage("你好，{name}", {}, "zh-CN")).not.toThrow()
    })

    /** §10.2：回退链上取到的消息，断言的是格式化结果而不只是「拿到一个字符串」 */
    it("formats a message that came from the fallback locale", () => {
        const partial: I18nResources = {
            "zh-CN": { "order.items": "{count} 件商品" },
            "en-US": {},
        }
        expect(
            formatMessage(templateOf(partial, "en-US", "order.items"), { count: 2 }, "en-US"),
        ).toBe("2 件商品")
    })
})

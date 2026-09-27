import { describe, expect, it } from "vitest"

import { formatMessage, resolveMessage, type I18nResources } from "./message"

const resources: I18nResources = {
    "zh-CN": {
        "common.greeting": "你好，{name}",
        "common.items": "{count, plural, =0 {没有商品} =1 {1 件商品} other {# 件商品}}",
        "common.role": "{role, select, buyer {买家} seller {卖家} other {其他}}",
    },
    "en-US": {
        "common.greeting": "Hello, {name}",
        "common.items": "{count, plural, =0 {No items} =1 {1 item} other {# items}}",
        "common.role": "{role, select, buyer {Buyer} seller {Seller} other {Other}}",
    },
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

    it("replaces plural categories", () => {
        const template = "{count, plural, =0 {No items} =1 {1 item} other {# items}}"
        expect(formatMessage(template, { count: 0 }, "en-US")).toBe("No items")
        expect(formatMessage(template, { count: 1 }, "en-US")).toBe("1 item")
        expect(formatMessage(template, { count: 3 }, "en-US")).toBe("3 items")
    })

    it("replaces select categories", () => {
        const template = "{role, select, buyer {Buyer} seller {Seller} other {Other}}"
        expect(formatMessage(template, { role: "seller" }, "en-US")).toBe("Seller")
    })
})

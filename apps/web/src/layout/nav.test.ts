import { describe, expect, it } from "vite-plus/test"

import type { WebTranslate } from "#/locales/messages.gen"

import { isNavGroupActive, SITE_NAV_ITEMS, type SiteNavItem, translateNavItems } from "./nav"

function flat<T extends { children?: readonly T[] }>(items: readonly T[]): T[] {
    return items.flatMap((item) => [item, ...flat(item.children ?? [])])
}

describe("translateNavItems 只做替换", () => {
    const echo: WebTranslate = ((key: string) => `[${key}]`) as WebTranslate
    const translated = translateNavItems(SITE_NAV_ITEMS, echo)

    const sell = translated.find((item) => item.label === "[nav.sell]")

    it("to 一律不动_外链也不会被当成 key", () => {
        expect(sell?.children?.[0]?.to).toBe("/sell")
        expect(sell?.children?.[1]?.to).toMatch(/^https?:\/\//)
    })

    it("三级树逐层翻译_不丢子树也不拍平", () => {
        const category = translated.find((item) => item.label === "[nav.category]")
        expect(category?.children?.[0]?.children?.[0]?.label).toBe("[nav.women]")
        expect(flat(translated)).toHaveLength(flat(SITE_NAV_ITEMS).length)
        expect(category?.children).toHaveLength(6)
    })
})

describe("下拉组的高亮判据", () => {
    const CATEGORY: SiteNavItem = {
        label: "商品分类",
        children: [
            {
                label: "服饰鞋包",
                to: "/categories/apparel",
                children: [{ label: "女装", to: "/categories/apparel/women" }],
            },
            { label: "数码家电", to: "/categories/digital" },
        ],
    }
    const SELL: SiteNavItem = {
        label: "开店入驻",
        children: [{ label: "我要开店", to: "/sell" }],
    }

    it("停在二级自身_该组激活", () => {
        expect(isNavGroupActive("/categories/apparel", CATEGORY)).toBe(true)
    })

    it("停在三级_二级还没落地页，也得知道用户是从这个组来的", () => {
        expect(isNavGroupActive("/categories/apparel/women", CATEGORY)).toBe(true)
    })

    it("前缀相似但不成段_不算命中，否则 /digitalphones 会点亮「数码家电」", () => {
        expect(isNavGroupActive("/categories/digitalphones", CATEGORY)).toBe(false)
    })

    it("别的组的子项_不点亮本组", () => {
        expect(isNavGroupActive("/categories/apparel/women", SELL)).toBe(false)
    })

    it("直达项（无 children）_永远 false，它自己走精确匹配", () => {
        expect(isNavGroupActive("/categories/apparel/women", { label: "首页", to: "/" })).toBe(
            false,
        )
    })
})

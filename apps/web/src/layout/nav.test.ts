import { describe, expect, it } from "vite-plus/test"

import type { WebTranslate } from "#/locales/messages.gen"

import { isNavGroupActive, SITE_NAV_ITEMS, type SiteNavItem, translateNavItems } from "./nav"

/** 菜单树里出现过的所有项（三层都收集），供「结构有没有变」这类断言用；源与译后两种形状都能喂 */
function flat<T extends { children?: readonly T[] }>(items: readonly T[]): T[] {
    return items.flatMap((item) => [item, ...flat(item.children ?? [])])
}

/**
 * 菜单树是数据、翻译是纯函数、激活判据是纯函数——三者都能在 node 里问话，
 * 所以这里只测「换语言不漏项」和「哪个组算当前组」这两条决定，不碰渲染。
 *
 * 「每一项都带 key、且 key 拼得对」不再有用例：那是 `SITE_NAV_ITEMS` 那行类型标注在管，
 * 漏写或写错都是编译错误，运行时断言它等于断言 `true`。
 */

describe("translateNavItems 只做替换", () => {
    // t 记一笔只为把句子变成带括号的 key，好对比树形与原文；不拿它的长度当断言：
    // 「每个项查表一次」是调用次数，加缓存或去重都会红，而那两种改法并没有改坏菜单
    const echo: WebTranslate = ((key: string) => `[${key}]`) as WebTranslate
    const translated = translateNavItems(SITE_NAV_ITEMS, echo)

    const sell = translated.find((item) => item.label === "[web.nav.sell]")

    it("to 一律不动_外链也不会被当成 key", () => {
        expect(sell?.children?.[0]?.to).toBe("/sell")
        expect(sell?.children?.[1]?.to).toMatch(/^https?:\/\//)
    })

    it("三级树逐层翻译_不丢子树也不拍平", () => {
        const category = translated.find((item) => item.label === "[web.nav.category]")
        expect(category?.children?.[0]?.children?.[0]?.label).toBe("[web.nav.women]")
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

import { describe, expect, it } from "vite-plus/test"

import {
    isNavGroupActive,
    NAV_LABEL_KEYS,
    SITE_NAV_ITEMS,
    type SiteNavItem,
    translateNavItems,
} from "./nav"

/** 菜单树里出现过的所有 label（三层都收集），供「翻译表是否漏项」这类结构断言用 */
function labelsOf(items: SiteNavItem[]): string[] {
    const labels: string[] = []
    for (const item of items) {
        labels.push(item.label)
        for (const child of item.children ?? []) {
            labels.push(child.label)
            for (const leaf of child.children ?? []) labels.push(leaf.label)
        }
    }
    return labels
}

/**
 * 菜单树是数据、翻译表是数据、激活判据是纯函数——三者都能在 node 里问话，
 * 所以这里只测「换语言不漏项」和「哪个组算当前组」这两条决定，不碰渲染。
 */
describe("翻译表覆盖菜单树", () => {
    it("每个 label 都有登记的 i18n key_新增类目而不登记，英文站会直接露出中文", () => {
        const missing = labelsOf(SITE_NAV_ITEMS).filter(
            (label) => NAV_LABEL_KEYS[label] === undefined,
        )
        expect(missing).toEqual([])
    })

    it("未登记的 label 原样交给 t_不抛错也不变空串", () => {
        expect(translateNavItems([{ label: "隐藏入口", to: "/x" }], (key) => key)).toEqual([
            { label: "隐藏入口", to: "/x" },
        ])
    })
})

describe("translateNavItems 只做替换", () => {
    // t 里记一笔，用来问「整棵树每个 label 各翻译了一次、不多不少」
    const seen: string[] = []
    const translated = translateNavItems(SITE_NAV_ITEMS, (key) => {
        seen.push(key)
        return `[${key}]`
    })

    const sell = translated.find((item) => item.label === "[web.nav.sell]")

    it("to 一律不动_外链也不会被当成 key", () => {
        expect(sell?.children?.[0]?.to).toBe("/sell")
        expect(sell?.children?.[1]?.to).toMatch(/^https?:\/\//)
    })

    it("三级树逐层翻译_不丢子树也不拍平", () => {
        const category = translated.find((item) => item.label === "[web.nav.category]")
        expect(category?.children?.[0]?.children?.[0]?.label).toBe("[web.nav.women]")
        expect(labelsOf(translated)).toHaveLength(labelsOf(SITE_NAV_ITEMS).length)
    })

    it("树上每个 label 各查表一次_一层查两层查三层查", () => {
        expect(seen).toHaveLength(labelsOf(SITE_NAV_ITEMS).length)
    })

    it("不改入参_菜单树是模块级常量，改脏一次全局跟着错", () => {
        expect(SITE_NAV_ITEMS[0]?.label).toBe("首页")
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

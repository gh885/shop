import { describe, expect, it } from "vite-plus/test"

import { translateSidebarItems, type SidebarItem, type SidebarSourceItem } from "./navigation"

/**
 * 菜单翻译就是「把每层的 key 换成句子，其余原样搬过去」。这里钉的是**搬运**那一半：
 * key 位、icon、dividerAfter、search 这些不是文案的东西必须原样留着——少搬一个不会报错，
 * 只会让菜单少个图标或少条分隔线（这正是源/译两套形状分开写之后最容易漏的地方）。
 */
const SOURCE: readonly SidebarSourceItem<string>[] = [
    { key: "home", labelKey: "seller.nav.home", to: "/", icon: "🏠" },
    {
        key: "trade",
        labelKey: "seller.nav.trade",
        icon: "📅",
        dividerAfter: true,
        sections: [
            {
                titleKey: "seller.nav.trade.section.0",
                collapsible: true,
                items: [
                    { key: "order", labelKey: "seller.nav.trade.order", to: "/trade/order" },
                    {
                        key: "search",
                        labelKey: "seller.nav.trade.search",
                        to: "/trade/order",
                        search: { page: 2 },
                    },
                ],
            },
        ],
    },
]

const echo = (key: string) => `[${key}]`

/** 测试里按位置取分组那一项，顺手把联合收窄成「有 sections 的那一半」 */
function groupAt(items: SidebarItem[], index: number) {
    const item = items[index]
    if (item === undefined || !("sections" in item)) throw new Error(`第 ${index} 项不是分组`)
    return item
}

/** 同上，取顶层叶子（「有 to 的那一半」） */
function leafAt(items: SidebarItem[], index: number) {
    const item = items[index]
    if (item === undefined || !("to" in item)) throw new Error(`第 ${index} 项不是叶子`)
    return item
}

describe("translateSidebarItems", () => {
    const translated = translateSidebarItems(SOURCE, echo)
    const trade = groupAt(translated, 1)

    it("每层的 key 都换成句子：叶子、分组、二级标题各一处", () => {
        expect(translated[0]?.label).toBe("[seller.nav.home]")
        expect(trade.label).toBe("[seller.nav.trade]")
        expect(trade.sections[0]?.title).toBe("[seller.nav.trade.section.0]")
        expect(trade.sections[0]?.items[0]?.label).toBe("[seller.nav.trade.order]")
    })

    it("不是文案的东西原样搬过去：icon / dividerAfter / to / search", () => {
        // 顶层叶子也带图标（卖家端的「首页」「客服」就是），少搬一个不会报错，只会少个图标
        const home = leafAt(translated, 0)
        expect(home.icon).toBe("🏠")
        expect(home.to).toBe("/")
        expect(trade.icon).toBe("📅")
        expect(trade.dividerAfter).toBe(true)
        // 源树上的目标查询参数也是菜单数据的一部分，翻译不该碰它
        expect(trade.sections[0]?.items[1]?.search).toEqual({ page: 2 })
    })

    it("collapsible 跟着走：折叠列的分组丢了它就永远展不开", () => {
        expect(trade.sections[0]?.collapsible).toBe(true)
    })

    it("不改入参：菜单树是模块级常量，改脏一次全局跟着错", () => {
        expect(SOURCE[0]).not.toHaveProperty("label")
    })
})

import { describe, expect, it } from "vite-plus/test"

import { translateSidebarItems, type SidebarItem, type SidebarSourceItem } from "./navigation"

/** 钉的是「搬运」那一半：key 位、icon、dividerAfter、search 等非文案字段必须原样留着，少搬一个不报错、只会静默少个图标/分隔线 */
const SOURCE: readonly SidebarSourceItem<string>[] = [
    { key: "home", labelKey: "nav.home", to: "/", icon: "🏠" },
    {
        key: "trade",
        labelKey: "nav.trade",
        icon: "📅",
        dividerAfter: true,
        sections: [
            {
                titleKey: "nav.trade.section.0",
                collapsible: true,
                items: [
                    { key: "order", labelKey: "nav.trade.order", to: "/trade/order" },
                    {
                        key: "search",
                        labelKey: "nav.trade.search",
                        to: "/trade/order",
                        search: { page: 2 },
                    },
                ],
            },
        ],
    },
]

const echo = (key: string) => `[${key}]`

function groupAt(items: SidebarItem[], index: number) {
    const item = items[index]
    if (item === undefined || !("sections" in item)) throw new Error(`第 ${index} 项不是分组`)
    return item
}

function leafAt(items: SidebarItem[], index: number) {
    const item = items[index]
    if (item === undefined || !("to" in item)) throw new Error(`第 ${index} 项不是叶子`)
    return item
}

describe("translateSidebarItems", () => {
    const translated = translateSidebarItems(SOURCE, echo)
    const trade = groupAt(translated, 1)

    it("每层的 key 都换成句子：叶子、分组、二级标题各一处", () => {
        expect(translated[0]?.label).toBe("[nav.home]")
        expect(trade.label).toBe("[nav.trade]")
        expect(trade.sections[0]?.title).toBe("[nav.trade.section.0]")
        expect(trade.sections[0]?.items[0]?.label).toBe("[nav.trade.order]")
    })

    it("不是文案的东西原样搬过去：icon / dividerAfter / to / search", () => {
        const home = leafAt(translated, 0)
        expect(home.icon).toBe("🏠")
        expect(home.to).toBe("/")
        expect(trade.icon).toBe("📅")
        expect(trade.dividerAfter).toBe(true)
        expect(trade.sections[0]?.items[1]?.search).toEqual({ page: 2 })
    })

    it("collapsible 跟着走：折叠列的分组丢了它就永远展不开", () => {
        expect(trade.sections[0]?.collapsible).toBe(true)
    })

    it("不改入参：菜单树是模块级常量，改脏一次全局跟着错", () => {
        expect(SOURCE[0]).not.toHaveProperty("label")
    })
})

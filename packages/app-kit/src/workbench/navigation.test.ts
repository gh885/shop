import { describe, expect, it } from "vitest"

import type { SidebarGroup, SidebarItem, SidebarLeaf } from "./navigation"

import { activeSectionOf, matchesSidebarPath } from "./navigation"

/**
 * 侧栏高亮：路径匹配与「当前该展开哪个分组」。
 *
 * 两个容易写反的地方：前缀匹配必须认路径段边界（否则 `/product` 会把 `/product-list`
 * 也算成自己），以及根路径 `/` 只能精确匹配（不然每个页面都算首页、首页那条永远高亮）。
 */

const shopGroup: SidebarGroup = {
    key: "shop",
    label: "店铺",
    sections: [
        { title: "地址", items: [{ key: "address", label: "地址管理", to: "/shop/address" }] },
        { title: "成员", items: [{ key: "member", label: "成员", to: "/shop/member" }] },
    ],
}

const otherGroup: SidebarGroup = {
    key: "trade",
    label: "交易",
    sections: [{ title: "订单", items: [{ key: "order", label: "订单", to: "/trade/order" }] }],
}

const homeLeaf: SidebarLeaf = { key: "home", label: "首页", to: "/" }

const items: SidebarItem[] = [homeLeaf, shopGroup, otherGroup]

describe("matchesSidebarPath", () => {
    it("同一路径命中", () => {
        expect(matchesSidebarPath("/shop/address", "/shop/address")).toBe(true)
    })

    it("子路径命中：详情页也算在列表这一项下", () => {
        expect(matchesSidebarPath("/product/list", "/product/list/123")).toBe(true)
    })

    it("段边界外的同前缀不算命中：/product 不该把 /product-list 认领下来", () => {
        expect(matchesSidebarPath("/product", "/product-list")).toBe(false)
    })

    it("根路径只精确匹配：否则首页会跟每个页面抢高亮", () => {
        expect(matchesSidebarPath("/", "/")).toBe(true)
        expect(matchesSidebarPath("/", "/cms/nav")).toBe(false)
    })
})

describe("activeSectionOf", () => {
    it("按分组自己的路径段认领：/shop/member 展开店铺组", () => {
        expect(activeSectionOf(items, "/shop/member")?.key).toBe("shop")
    })

    it("分组路径对不上时，按叶子反查：菜单挂在一个前缀下、页面在另一个前缀也能认出来", () => {
        const leafOnly: SidebarItem[] = [
            {
                ...shopGroup,
                key: "misc",
                sections: [
                    {
                        title: "审核",
                        items: [{ key: "review", label: "入驻审核", to: "/review/onboarding" }],
                    },
                ],
            },
        ]

        expect(activeSectionOf(leafOnly, "/review/onboarding")?.key).toBe("misc")
    })

    it("没有任何分组能接住这个路径：返回 undefined，侧栏保持原样而不是强行折叠全部", () => {
        expect(activeSectionOf(items, "/nowhere")).toBeUndefined()
    })

    it("首页叶子不参与分组归属：它没有 sections", () => {
        expect(activeSectionOf(items, "/")).toBeUndefined()
    })
})

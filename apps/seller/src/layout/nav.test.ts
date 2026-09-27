import type { SidebarItem } from "@shop/app-kit"

import { describe, expect, it } from "vitest"

import { crumbsOf, FULL_WIDTH_PATHS, leafLabelOf, WORKBENCH_TITLE } from "./nav"

/** 两栏菜单：一个一级叶子（首页）+ 一个带二级栏目的分组（交易） */
const ITEMS: SidebarItem[] = [
    { key: "home", label: "首页", to: "/" },
    {
        key: "trade",
        label: "交易",
        sections: [
            {
                title: "交易管理",
                items: [
                    { key: "order", label: "订单列表", to: "/trade/order" },
                    { key: "refund", label: "退款售后", to: "/trade/refund" },
                ],
            },
        ],
    },
]

describe("leafLabelOf（路径 → 页面标题）", () => {
    it("命中二级叶子就用叶子的名字：标题跟着侧边栏的选中项走", () => {
        expect(leafLabelOf(ITEMS, "/trade/refund")).toBe("退款售后")
    })

    it("只有一级分组的路径点不到叶子，落到工作台标题", () => {
        expect(leafLabelOf(ITEMS, "/trade")).toBe(WORKBENCH_TITLE)
        expect(leafLabelOf(ITEMS, "/nope")).toBe(WORKBENCH_TITLE)
    })

    it("一级叶子不参与标题：菜单根 / 是直接重定向到商品列表的，没有页面挂在其上", () => {
        expect(leafLabelOf(ITEMS, "/")).toBe(WORKBENCH_TITLE)
    })
})

describe("crumbsOf（路径 → 面包屑）", () => {
    it("分组内的页面给三段：首页 / 一级栏目 / 当前页", () => {
        expect(crumbsOf(ITEMS, "/trade/order", "首页")).toEqual([
            { label: "首页", to: "/" },
            { label: "交易" },
            { label: "订单列表" },
        ])
    })

    it("命中不到分组时只剩首页一项：不给用户编出一条没走过的路", () => {
        expect(crumbsOf(ITEMS, "/nope", "首页")).toEqual([{ label: "首页", to: "/" }])
    })

    it("首页自己不当分组：面包屑不会出现「首页 / 首页」", () => {
        expect(crumbsOf(ITEMS, "/", "首页")).toEqual([{ label: "首页", to: "/" }])
    })
})

describe("FULL_WIDTH_PATHS（通栏页）", () => {
    it("发布流程两步通栏：侧边栏与面包屑要让位给锚点页签", () => {
        expect(FULL_WIDTH_PATHS.has("/product/create/category")).toBe(true)
        expect(FULL_WIDTH_PATHS.has("/product/create/basic")).toBe(true)
    })

    it("通栏名单按整路径精确命中：/product/list 这类常规页不该被顺手收成无侧栏", () => {
        expect(FULL_WIDTH_PATHS.has("/product/list")).toBe(false)
        expect(FULL_WIDTH_PATHS.has("/product/create")).toBe(false)
    })
})

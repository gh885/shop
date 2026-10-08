import type { SidebarItem } from "@shop/app-kit/shell"
import { describe, expect, it } from "vite-plus/test"

import { crumbsOf, FULL_WIDTH_PATHS, leafLabelOf } from "./nav"

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

/**
 * 兜底标题由调用方给（生产上是 `t(...)`），这里给一个可辨识的定值即可：
 * 本文件不持有文案，句子对不对由 catalog 的门禁管。
 */
const FALLBACK = "〔兜底标题〕"

describe("leafLabelOf（路径 → 页面标题）", () => {
    it("命中二级叶子就用叶子的名字：标题跟着侧边栏的选中项走", () => {
        expect(leafLabelOf(ITEMS, "/trade/refund", FALLBACK)).toBe("退款售后")
    })

    it("只有一级分组的路径点不到叶子，落到工作台标题", () => {
        expect(leafLabelOf(ITEMS, "/trade", FALLBACK)).toBe(FALLBACK)
        expect(leafLabelOf(ITEMS, "/nope", FALLBACK)).toBe(FALLBACK)
    })

    it("一级叶子不参与标题：菜单根 / 是直接重定向到商品列表的，没有页面挂在其上", () => {
        expect(leafLabelOf(ITEMS, "/", FALLBACK)).toBe(FALLBACK)
    })
})

describe("crumbsOf（路径 → 面包屑）", () => {
    it("分组内的页面给三段：首页 / 一级栏目 / 当前页", () => {
        expect(crumbsOf(ITEMS, "/trade/order", { home: "首页", fallback: FALLBACK })).toEqual([
            { label: "首页", to: "/" },
            { label: "交易" },
            { label: "订单列表" },
        ])
    })

    it("停在一级分组的根_当前页那格用兜底标题，不是空的也不是上一层的名字", () => {
        // 这条曾经漏过：分组根点不到叶子，旧实现在这里直接返回模块级常量（写死的中文），
        // 改成调用方传入后，兜底句与其它文案一样随语言变
        expect(crumbsOf(ITEMS, "/trade", { home: "首页", fallback: FALLBACK })).toEqual([
            { label: "首页", to: "/" },
            { label: "交易" },
            { label: FALLBACK },
        ])
    })

    it("命中不到分组时只剩首页一项：不给用户编出一条没走过的路", () => {
        expect(crumbsOf(ITEMS, "/nope", { home: "首页", fallback: FALLBACK })).toEqual([
            { label: "首页", to: "/" },
        ])
    })

    it("首页自己不当分组：面包屑不会出现「首页 / 首页」", () => {
        expect(crumbsOf(ITEMS, "/", { home: "首页", fallback: FALLBACK })).toEqual([
            { label: "首页", to: "/" },
        ])
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

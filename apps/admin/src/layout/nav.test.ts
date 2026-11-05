import { translateSidebarItems } from "@shop/app-kit/shell"
import { describe, expect, it } from "vite-plus/test"

import { allowsLeaf, LEAF_PERMISSIONS, NAV_SOURCE_ITEMS } from "./nav"

const NAV_ITEMS = translateSidebarItems(NAV_SOURCE_ITEMS, (key) => key)

const leafKeys = NAV_ITEMS.flatMap((item) =>
    "sections" in item
        ? item.sections.flatMap((section) => section.items.map((leaf) => leaf.key))
        : [],
)

describe("allowsLeaf", () => {
    it("没登记权限码的 key 一律可见：新增页面漏登记偏向「看得见」，后端那道闸仍在", () => {
        expect(allowsLeaf("categories", [])).toBe(true)
        expect(allowsLeaf("categories", undefined)).toBe(true)
    })

    it("权限码明确没有就不给看；undefined = 未知（后端没有 me 端点）按放行处理", () => {
        expect(allowsLeaf("staff", ["PRODUCT_REVIEW"])).toBe(false)
        expect(allowsLeaf("staff", [])).toBe(false)
        expect(allowsLeaf("staff", undefined)).toBe(true)
    })

    it("带上所需的那条码才出现", () => {
        expect(allowsLeaf("staff", ["platform_staff:write"])).toBe(true)
        expect(allowsLeaf("users", ["platform_staff:write"])).toBe(true)
    })

    it("通配符 * 不放行：SUPER_ADMIN 在 me 出参就被展开成全量码清单，通配符只活在服务端", () => {
        expect(allowsLeaf("staff", ["*"])).toBe(false)
    })

    it("登记表里的 key 都是 NAV_ITEMS 里真实存在的叶子（写错一个字母就是永不动作的死码）", () => {
        for (const key of Object.keys(LEAF_PERMISSIONS)) {
            expect(leafKeys, `LEAF_PERMISSIONS 里的 ${key} 在菜单里找不到`).toContain(key)
        }
    })
})

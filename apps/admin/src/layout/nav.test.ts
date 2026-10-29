import { translateSidebarItems } from "@shop/app-kit/shell"
import { describe, expect, it } from "vite-plus/test"

import { allowsLeaf, LEAF_PERMISSIONS, NAV_SOURCE_ITEMS, visibleNavGroups } from "./nav"

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
        expect(allowsLeaf("staff", ["STAFF_MANAGE"])).toBe(true)
        expect(allowsLeaf("users", ["STAFF_MANAGE"])).toBe(true)
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

describe("visibleNavGroups", () => {
    it("权限清单未知（undefined）时全显：后端没有 me 端点，菜单不是安全边界", () => {
        const keys: string[] = visibleNavGroups(NAV_ITEMS, undefined).flatMap((group) =>
            group.sections.flatMap((section) => section.items.map((leaf) => leaf.key)),
        )
        expect(keys).toEqual(["users", "staff", "categories", "logistics"])
    })

    it("权限为空数组：登记过权限码的入口全收掉，没登记的（类目）照常留着", () => {
        const keys: string[] = visibleNavGroups(NAV_ITEMS, []).flatMap((group) =>
            group.sections.flatMap((section) => section.items.map((leaf) => leaf.key)),
        )

        expect(keys).toEqual(["categories"])
        for (const gated of Object.keys(LEAF_PERMISSIONS)) {
            expect(keys, `登记过权限码的 ${gated} 没有码就不该出现`).not.toContain(gated)
        }
    })

    it("只剩一个入口的分组被裁掉时整组一起收（留个没入口的标题像权限没生效）", () => {
        for (const group of visibleNavGroups(NAV_ITEMS, [])) {
            expect(group.sections.length).toBeGreaterThan(0)
            for (const section of group.sections) {
                expect(section.items.length).toBeGreaterThan(0)
            }
        }
        // 账号组两个叶子都要 STAFF_MANAGE，没码就整组消失
        expect(visibleNavGroups(NAV_ITEMS, []).map((group) => group.key)).toEqual(["product"])
    })

    it("有员工管理码的人看得见账号组", () => {
        const groups = visibleNavGroups(NAV_ITEMS, ["STAFF_MANAGE"])
        expect(groups.map((group) => group.key)).toEqual(["account", "product"])
        const account = groups.find((group) => group.key === "account")
        expect(account?.sections[0]?.items.map((leaf) => leaf.key)).toEqual(["users", "staff"])
    })
})

describe("NAV_SOURCE_ITEMS 的形状", () => {
    it("入口全是分组，没有顶层叶子", () => {
        const leaves = NAV_SOURCE_ITEMS.filter((item) => !("sections" in item))
        expect(leaves.map((item) => item.key)).toEqual([])
    })
})

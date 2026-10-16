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
        expect(allowsLeaf("cms-nav", ["AUDIT_VIEW"])).toBe(true)
    })

    it("权限码没到位就不给看：me 还在路上（undefined）与「确实没这条码」同一种落点", () => {
        expect(allowsLeaf("staff", ["CMS_MANAGE"])).toBe(false)
        expect(allowsLeaf("staff", [])).toBe(false)
        expect(allowsLeaf("staff", undefined)).toBe(false)
    })

    it("带上所需的那条码才出现", () => {
        expect(allowsLeaf("staff", ["STAFF_MANAGE"])).toBe(true)
        expect(allowsLeaf("audits", ["SHOP_REVIEW", "AUDIT_VIEW"])).toBe(true)
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
    it("权限为空：登记过权限码的入口全收掉，没登记的（类目、CMS）照常留着", () => {
        const groups = visibleNavGroups(NAV_ITEMS, [])
        const keys: string[] = groups.flatMap((group) =>
            group.sections.flatMap((section) => section.items.map((leaf) => leaf.key)),
        )

        expect(keys).toEqual(expect.arrayContaining(["categories", "cms-nav"]))
        for (const gated of Object.keys(LEAF_PERMISSIONS)) {
            expect(keys, `登记过权限码的 ${gated} 没有码就不该出现`).not.toContain(gated)
        }
    })

    it("只剩一个入口的分组被裁掉时整组一起收（留个没入口的标题像权限没生效）", () => {
        const keys: string[] = visibleNavGroups(NAV_ITEMS, []).map((group) => group.key)

        expect(keys).not.toContain("coupon-ops")
        for (const group of visibleNavGroups(NAV_ITEMS, [])) {
            expect(group.sections.length).toBeGreaterThan(0)
            for (const section of group.sections) {
                expect(section.items.length).toBeGreaterThan(0)
            }
        }
    })

    it("只留这个人进得去的分组：审核员有入驻审核与店铺治理，没有员工管理", () => {
        const groups = visibleNavGroups(NAV_ITEMS, ["SHOP_REVIEW", "SHOP_GOVERNANCE", "AUDIT_VIEW"])
        const keys = groups.map((group) => group.key)
        expect(keys).toContain("merchant")
        expect(keys).not.toContain("account")
        expect(keys).not.toContain("coupon-ops")

        const merchant = groups.find((group) => group.key === "merchant")
        expect(merchant?.sections[0]?.items.map((leaf) => leaf.key)).toEqual(["review", "shops"])
    })

    it("顶层叶子（本项目没有）不参与裁剪：只消费带 sections 的那一半", () => {
        const groups = visibleNavGroups(NAV_ITEMS, ["STAFF_MANAGE"])

        expect(groups.every((group) => group.sections.length > 0)).toBe(true)
        expect(groups.map((group) => group.key)).toContain("account")
    })
})

describe("NAV_SOURCE_ITEMS 的形状", () => {
    it("入口全是分组，没有顶层叶子", () => {
        const leaves = NAV_SOURCE_ITEMS.filter((item) => !("sections" in item))
        expect(leaves.map((item) => item.key)).toEqual([])
    })
})

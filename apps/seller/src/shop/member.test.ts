import { describe, expect, it } from "vite-plus/test"

import type { ShopMemberItem } from "@shop/api/sdk"

import { InviteFormSchema, isShopOwner } from "./member"

/**
 * 店主判定的行为：它决定这一页画不画「邀请」和「移除成员」。
 *
 * 判错的方向是越权而不是报错，所以重点钉「什么情况下不给入口」——
 * 数据没到、当前用户还不知道、店主那行还没接受邀请，三种都不是店主。
 */

/** 成员一行（判定只吃 role/status/userId，其余列给个合法值占位） */
function member(overrides: Partial<ShopMemberItem> = {}): ShopMemberItem {
    return {
        memberId: "m-1",
        userId: "u-1",
        phone: null,
        role: "MEMBER",
        status: "ACTIVE",
        permissions: [],
        ...overrides,
    }
}

const OWNER: ShopMemberItem = member({ role: "OWNER" })

describe("isShopOwner（谁是店主）", () => {
    it("本人那行是 ACTIVE 的 OWNER：给治理入口", () => {
        expect(isShopOwner([member(), OWNER], "u-1")).toBe(true)
    })

    it("本人只是店员：不给入口，哪怕列表里另有店主", () => {
        expect(isShopOwner([OWNER, member({ userId: "u-2" })], "u-2")).toBe(false)
    })

    it("店主身份看的是成员角色而不是 permissions 列：权限集是后端下发的另一件事", () => {
        expect(isShopOwner([member({ role: "OWNER", permissions: [] })], "u-1")).toBe(true)
        expect(isShopOwner([member({ permissions: ["SHOP_MANAGE"] })], "u-1")).toBe(false)
    })

    it("店主还没接受邀请（PENDING）：还没进过店，不给他移除别人的权力", () => {
        expect(isShopOwner([member({ role: "OWNER", status: "PENDING" })], "u-1")).toBe(false)
    })

    it("成员列表还没到：不是店主——少画两个按钮比放错入口好", () => {
        expect(isShopOwner(undefined, "u-1")).toBe(false)
        expect(isShopOwner([], "u-1")).toBe(false)
    })

    it("当前用户是谁还不知道：两个 undefined 相撞也不算命中", () => {
        // 早先的写法是 `m.userId === me.data?.id`，列表里那行 userId 缺失时两边都是 undefined，
        // 数据到达前的一瞬间就能把入口画给一个还不知道是谁的人
        expect(isShopOwner([OWNER], undefined)).toBe(false)
        const noUserId = member({ role: "OWNER", userId: undefined as unknown as string })
        expect(isShopOwner([noUserId], undefined)).toBe(false)
    })

    it("词表外的角色取值（后端加了新角色）不算店主：判定是等值比较，不会顺手放行", () => {
        const unknownRole = member({ role: "ADMIN" as unknown as ShopMemberItem["role"] })
        expect(isShopOwner([unknownRole], "u-1")).toBe(false)
    })
})

describe("InviteFormSchema（邀请手机号）", () => {
    it("正常大陆号放行", () => {
        expect(InviteFormSchema.safeParse({ phone: "13800000000" }).success).toBe(true)
    })

    it("1 后面跟 0/1/2 的段不放行：邀请的形状不许比登录宽，否则进去的号登录不了", () => {
        expect(InviteFormSchema.safeParse({ phone: "10000000000" }).success).toBe(false)
        expect(InviteFormSchema.safeParse({ phone: "12345678901" }).success).toBe(false)
    })

    it("位数不对、带非数字都不放行", () => {
        expect(InviteFormSchema.safeParse({ phone: "1380000000" }).success).toBe(false)
        expect(InviteFormSchema.safeParse({ phone: "138000000001" }).success).toBe(false)
        expect(InviteFormSchema.safeParse({ phone: "1380000000a" }).success).toBe(false)
    })
})

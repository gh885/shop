import { describe, expect, it } from "vite-plus/test"

import { PermissionCodes } from "@shop/common/contract"

import {
    CreateSubaccountFormSchema,
    ResetSubaccountPasswordFormSchema,
    SUBACCOUNT_PERMISSIONS,
    SUBACCOUNT_PERMISSION_LABEL,
    SUBACCOUNT_STATUS_META,
    subaccountPermissionLabel,
} from "./subaccount"

describe("子账号可授予权限码", () => {
    it("就是 PermissionCodes 的五个 seller 码，顺序即界面顺序", () => {
        expect([...SUBACCOUNT_PERMISSIONS]).toEqual([
            PermissionCodes.PRODUCT_MANAGE,
            PermissionCodes.ORDER_FULFILL,
            PermissionCodes.ADDRESS_MANAGE,
            PermissionCodes.SHIPPING_MANAGE,
            PermissionCodes.COUPON_MANAGE,
        ])
    })

    it("每个码都有标签 key，且认不出的码退回 undefined 而不是被吞掉", () => {
        for (const code of SUBACCOUNT_PERMISSIONS) {
            expect(subaccountPermissionLabel(code)).toBe(SUBACCOUNT_PERMISSION_LABEL[code])
        }
        expect(subaccountPermissionLabel("SOMETHING_NEW")).toBeUndefined()
    })

    it("admin 域的码不在可授予清单里（子账号不该拿到平台岗位权限）", () => {
        expect(SUBACCOUNT_PERMISSIONS).not.toContain(PermissionCodes.STAFF_MANAGE)
        expect(SUBACCOUNT_PERMISSIONS).not.toContain(PermissionCodes.SHOP_GOVERNANCE)
    })

    it("三档状态都有徽章与文案", () => {
        expect(Object.keys(SUBACCOUNT_STATUS_META).toSorted()).toEqual([
            "ACTIVE",
            "DISABLED",
            "PENDING_ACTIVATION",
        ])
    })
})

describe("新建子账号的入站形状", () => {
    const valid = { loginName: "kefu01", phone: "13900005678", password: "Password123" }

    it("合法输入通过", () => {
        expect(CreateSubaccountFormSchema.safeParse(valid).success).toBe(true)
    })

    it("登录名太短 / 带不允许的字符都被拦下（形状跟着契约，不在这里放宽）", () => {
        expect(CreateSubaccountFormSchema.safeParse({ ...valid, loginName: "ab" }).success).toBe(
            false,
        )
        expect(
            CreateSubaccountFormSchema.safeParse({ ...valid, loginName: "客服 01" }).success,
        ).toBe(false)
    })

    it("手机号不是大陆号段被拦下", () => {
        expect(
            CreateSubaccountFormSchema.safeParse({ ...valid, phone: "12900005678" }).success,
        ).toBe(false)
    })

    it("口令短于下限被拦下，且那条 issue 带着槽位数据（句子的 {min} 填得上）", () => {
        const parsed = CreateSubaccountFormSchema.safeParse({ ...valid, password: "short" })
        expect(parsed.success).toBe(false)
        // 用 unknown 接：params 不在 ZodIssue 的类型声明里，这里按运行时形状核、不按类型核
        const issue: unknown = parsed.error?.issues.find((one) => one.path[0] === "password")
        expect(issue).toMatchObject({
            message: "login.err.passwordMin",
            params: { min: expect.any(Number) },
        })
    })
})

describe("重置口令的入站形状", () => {
    it("只校验口令这一格", () => {
        expect(
            ResetSubaccountPasswordFormSchema.safeParse({ password: "Password123" }).success,
        ).toBe(true)
        expect(ResetSubaccountPasswordFormSchema.safeParse({ password: "1234" }).success).toBe(
            false,
        )
    })
})

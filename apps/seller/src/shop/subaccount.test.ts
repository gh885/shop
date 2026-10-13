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

/**
 * 子账号域纯规则的钉子。这里钉的两件事都是「错了不会报错、只会静默走偏」那类：
 *
 * - **可授予权限码与后端白名单逐格相同**：多一个码的后果是「勾了保存成功，但那个权限从未生效」；
 * - **登录名/口令的入站形状跟着契约**：放宽一位不会有任何测试变红，只会让后端 400。
 */
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
        // 用 unknown 接：zod 把 `withMinLength` 传的 `{message, params}` 摊在 issue 顶层，
        // 而 `params` 不在 `ZodIssue` 的声明里。渲染边界（ui-web 的 FieldError → app-kit 的翻译器）
        // 读的就是这两格，所以这里按运行时的形状核——不是按类型声明核
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

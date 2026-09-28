import { describe, expect, it } from "vite-plus/test"

import type { Address } from "./address"

import { AddressInputSchema, isBuiltinLabel, isCustomLabel, toDefaults } from "./address-form"

/**
 * 地址表单的入参侧逻辑：初值怎么来、标签算不算自定义、地区要填到哪一步。
 * 弹窗那层已经测过接线（AddressFormDialog），这里只钉这三个判断。
 * 单个字段的口径（号码几位、详址多长）在 @shop/common 测，这里测的是买家侧拼出来的那份 schema。
 */

function makeAddress(overrides: Partial<Address> = {}): Address {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        receiver: "张三",
        phone: "13800000000",
        regionCode: "310101",
        province: "上海市",
        city: "上海市",
        district: "黄浦区",
        detail: "南京东路 1 号",
        label: "HOME",
        isDefault: true,
        ...overrides,
    }
}

describe("toDefaults", () => {
    it("新增模式逐字段落空串，并带上两个默认决定：标签「家」、不设为默认", () => {
        expect(toDefaults()).toEqual({
            receiver: "",
            phone: "",
            regionCode: "",
            detail: "",
            label: "HOME",
            isDefault: false,
        })
    })

    it("编辑模式带回原值，但不带 id 也不带省市区名：表单只管用户填的那几项", () => {
        const values = toDefaults(makeAddress())

        expect(values).toMatchObject({ receiver: "张三", isDefault: true })
        expect(values).not.toHaveProperty("id")
        expect(values).not.toHaveProperty("province")
        expect(values).not.toHaveProperty("district")
    })

    it("没贴标签的旧地址，编辑时初值会被填成内置「家」：保存即补上标签（当前口径）", () => {
        expect(toDefaults(makeAddress({ label: undefined })).label).toBe("HOME")
    })
})

describe("标签判定", () => {
    it("内置表里的算内置：不再展开自定义输入框", () => {
        expect(isBuiltinLabel("HOME")).toBe(true)
        expect(isBuiltinLabel("PARENTS")).toBe(true)
        expect(isCustomLabel("HOME")).toBe(false)
    })

    it("空串是「未选」，两种都不算：否则一打开弹窗就凭空长出自定义框", () => {
        expect(isBuiltinLabel("")).toBe(false)
        expect(isCustomLabel("")).toBe(false)
        expect(isCustomLabel(undefined)).toBe(false)
    })

    it("表外的值才算自定义标签", () => {
        expect(isCustomLabel("公司楼下")).toBe(true)
    })
})

describe("地区只填到码", () => {
    it("初值里没有省市区名也过得了校验：名字是提交时按 regionCode 反查的派生值", () => {
        const values = toDefaults(makeAddress())

        expect(values).not.toHaveProperty("province")
        expect(AddressInputSchema.safeParse(values).success).toBe(true)
    })
})

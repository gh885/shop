import { describe, expect, it } from "vitest"

import type {
    ShippingTemplateFeeTier,
    ShippingTemplateRegionRule,
    ShippingTemplateResponse,
} from "@shop/api/sdk"

import {
    shippingTemplateFormFromResponse,
    shippingTemplateRequestFromForm,
    validateShippingTemplateForm,
    type FeeTierFormValue,
    type RegionRuleFormValue,
    type ShippingTemplateFormValues,
} from "./model"

/**
 * 运费模板的 wire↔表单双向投影 + 提交前校验。
 *
 * 这一进一出是全站唯一会静默改钱的地方：表单里是「元」字符串、wire 上是分 + 币种，
 * 而 `regionRules` 在响应里嵌套一层 `rule`、在请求里又是平的。测试钉住的就是这两个
 * 形状不对齐的接缝，以及「运费规则与不配送不能落在同一地区」这条只有全量才看得出的规则。
 */

function makeFeeTier(overrides: Partial<ShippingTemplateFeeTier> = {}): ShippingTemplateFeeTier {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000009",
        firstQuantity: 1,
        firstFee: { amount: 1200, currency: "CNY" },
        addQuantity: 2,
        addFee: { amount: 500, currency: "CNY" },
        ...overrides,
    }
}

function makeRegionRule(
    overrides: Partial<ShippingTemplateRegionRule> = {},
): ShippingTemplateRegionRule {
    return {
        rule: makeFeeTier(),
        regionPrefixes: ["31", "32"],
        ...overrides,
    }
}

function makeTemplate(overrides: Partial<ShippingTemplateResponse> = {}): ShippingTemplateResponse {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        shopId: "6f1a5b1e-2f3c-4a5d-8e9f-000000000002",
        freeShipping: false,
        freeOverQuantity: null,
        freeOverAmount: null,
        defaultRule: makeFeeTier(),
        regionRules: [],
        excludedRegions: [],
        ...overrides,
    }
}

const DEFAULT_TIER: FeeTierFormValue = {
    firstQuantity: "1",
    firstFee: "12.00",
    addQuantity: "2",
    addFee: "5.00",
}

const REGION_TIER_ID = "6f1a5b1e-2f3c-4a5d-8e9f-000000000009"

function region(
    regionPrefixes: string[],
    overrides: Partial<RegionRuleFormValue> = {},
): RegionRuleFormValue {
    return {
        id: REGION_TIER_ID,
        regionPrefixes,
        ...DEFAULT_TIER,
        ...overrides,
    }
}

function makeFormValues(overrides: Partial<ShippingTemplateFormValues> = {}) {
    return {
        freeShipping: false,
        freeOverQuantity: "",
        freeOverAmount: "",
        defaultRule: { ...DEFAULT_TIER },
        regionRules: [],
        excludedRegions: [],
        ...overrides,
    }
}

describe("shippingTemplateFormFromResponse：响应 → 表单", () => {
    it("响应里没有模板（店铺还没配过）：给出可编辑的空表单而不是抛错", () => {
        expect(shippingTemplateFormFromResponse(undefined)).toEqual({
            freeShipping: false,
            freeOverQuantity: "",
            freeOverAmount: "",
            defaultRule: { firstQuantity: "1", firstFee: "0.00", addQuantity: "1", addFee: "0.00" },
            regionRules: [],
            excludedRegions: [],
        })
    })

    it("分 → 元字符串：表单里读到的必须是「12.00」而不是「1200」", () => {
        const form = shippingTemplateFormFromResponse(makeTemplate())

        expect(form.defaultRule).toEqual({
            firstQuantity: "1",
            firstFee: "12.00",
            addQuantity: "2",
            addFee: "5.00",
        })
    })

    it("包邮门槛缺省：落成空串而不是「undefined」这句会显示进输入框的话", () => {
        const form = shippingTemplateFormFromResponse(makeTemplate())

        expect(form.freeOverQuantity).toBe("")
        expect(form.freeOverAmount).toBe("")
    })

    it("包邮门槛有值：数量走字符串、金额仍走元（回填后二次保存不该把它读成 0）", () => {
        const form = shippingTemplateFormFromResponse(
            makeTemplate({
                freeOverQuantity: 3,
                freeOverAmount: { amount: 9900, currency: "CNY" },
            }),
        )

        expect(form.freeOverQuantity).toBe("3")
        expect(form.freeOverAmount).toBe("99.00")
    })

    it("嵌套的 rule 拍平进表单行，id 只作前端列表 key", () => {
        const form = shippingTemplateFormFromResponse(
            makeTemplate({ regionRules: [makeRegionRule()] }),
        )

        expect(form.regionRules).toEqual([
            {
                id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000009",
                regionPrefixes: ["31", "32"],
                ...DEFAULT_TIER,
            },
        ])
    })

    it("原样透出响应数组的副本：改表单不该顺带改到 query 缓存里的那份", () => {
        const response = makeTemplate({
            regionRules: [makeRegionRule()],
            excludedRegions: ["54"],
        })

        const form = shippingTemplateFormFromResponse(response)
        form.excludedRegions.push("99")
        form.regionRules[0]!.regionPrefixes.push("99")

        expect(response.excludedRegions).toEqual(["54"])
        expect(response.regionRules[0]!.regionPrefixes).toEqual(["31", "32"])
    })
})

describe("validateShippingTemplateForm：返回第一条可读错误", () => {
    it("只有默认规则：合法", () => {
        expect(validateShippingTemplateForm(makeFormValues())).toBeUndefined()
    })

    it("首件数填 0：报「必须是大于等于 1 的整数」，错误文案带着是哪个字段", () => {
        expect(
            validateShippingTemplateForm(
                makeFormValues({ defaultRule: { ...DEFAULT_TIER, firstQuantity: "0" } }),
            ),
        ).toBe("首件必须是大于等于 1 的整数")
    })

    it("首件数填小数：整件数才成立，0.5 件不是运费单位", () => {
        expect(
            validateShippingTemplateForm(
                makeFormValues({ defaultRule: { ...DEFAULT_TIER, firstQuantity: "0.5" } }),
            ),
        ).toBe("首件必须是大于等于 1 的整数")
    })

    it("首费填成非数字：报金额格式而不是 NaN", () => {
        expect(
            validateShippingTemplateForm(
                makeFormValues({ defaultRule: { ...DEFAULT_TIER, firstFee: "abc" } }),
            ),
        ).toBe("首费格式不正确，请输入不小于 0 的金额")
    })

    it("包邮开关打开时，门槛上的脏值不该拦提交（那些框根本不参与计费）", () => {
        const values = makeFormValues({
            freeShipping: true,
            freeOverQuantity: "0",
            freeOverAmount: "-1",
        })

        expect(validateShippingTemplateForm(values)).toBeUndefined()
    })

    it("包邮开关关掉时，门槛才受检：满件 0 会让所有单都免邮", () => {
        const values = makeFormValues({ freeShipping: false, freeOverQuantity: "0" })

        expect(validateShippingTemplateForm(values)).toBe("满件包邮门槛必须是大于等于 1 的整数")
    })

    it("指定地区规则一条都没选地区：报第几条，而不是笼统说配置有误", () => {
        const values = makeFormValues({ regionRules: [region([]), region(["31"])] })

        expect(validateShippingTemplateForm(values)).toBe("第 1 条指定地区运费还没有选择地区")
    })

    it("同一地区落进两条规则：算费要先有个答案，报错点名是哪条编码", () => {
        const values = makeFormValues({ regionRules: [region(["31"]), region(["31", "32"])] })

        expect(validateShippingTemplateForm(values)).toBe("地区编码 31 配置了多条运费规则")
    })

    it("地区已配运费又设为不配送：两件事不能同时成立", () => {
        const values = makeFormValues({
            regionRules: [region(["31"])],
            excludedRegions: ["31"],
        })

        expect(validateShippingTemplateForm(values)).toBe(
            "地区编码 31 已配置运费规则，不能再设为不配送",
        )
    })

    it("不配送是父级编码、运费规则是子级编码：按编码逐个字面比，不做前缀包含判断", () => {
        // 钉住当前实现的边界：31 不配送 + 3101 收费是否会同时提交成功
        const values = makeFormValues({
            regionRules: [region(["3101"])],
            excludedRegions: ["31"],
        })

        expect(validateShippingTemplateForm(values)).toBeUndefined()
    })
})

describe("shippingTemplateRequestFromForm：表单 → 请求", () => {
    it("元 → 分：提交出去的是 Money，不是一串元", () => {
        const request = shippingTemplateRequestFromForm(makeFormValues())

        expect(request.defaultRule).toEqual({
            firstQuantity: 1,
            firstFee: { amount: 1200, currency: "CNY" },
            addQuantity: 2,
            addFee: { amount: 500, currency: "CNY" },
        })
    })

    it("表单行的 id 不进请求：那是前端列表 key", () => {
        const request = shippingTemplateRequestFromForm(
            makeFormValues({ regionRules: [region(["31"])] }),
        )

        expect(request.regionRules).toEqual([
            {
                regionPrefixes: ["31"],
                firstQuantity: 1,
                firstFee: { amount: 1200, currency: "CNY" },
                addQuantity: 2,
                addFee: { amount: 500, currency: "CNY" },
            },
        ])
    })

    it("包邮关掉：门槛才随请求发出", () => {
        const request = shippingTemplateRequestFromForm(
            makeFormValues({ freeShipping: false, freeOverQuantity: "3", freeOverAmount: "99.00" }),
        )

        expect(request.freeOverQuantity).toBe(3)
        expect(request.freeOverAmount).toEqual({ amount: 9900, currency: "CNY" })
    })

    it("包邮开着：门槛即使残留旧文本也不发（后端看到 freeShipping=true 就该忽略它们）", () => {
        const request = shippingTemplateRequestFromForm(
            makeFormValues({ freeShipping: true, freeOverQuantity: "3", freeOverAmount: "99.00" }),
        )

        expect(request.freeOverQuantity).toBeUndefined()
        expect(request.freeOverAmount).toBeUndefined()
    })

    it("排序性的重复不配送编码收敛成一个：请求体是去重后的集合", () => {
        const request = shippingTemplateRequestFromForm(
            makeFormValues({ excludedRegions: ["54", "54", "50"] }),
        )

        expect(request.excludedRegions).toEqual(["54", "50"])
    })

    it("来回一趟金额不漂移：响应 → 表单 → 请求 与原始 wire 同值", () => {
        const response = makeTemplate({
            freeOverQuantity: 3,
            freeOverAmount: { amount: 9900, currency: "CNY" },
            regionRules: [makeRegionRule({ rule: makeFeeTier({ id: REGION_TIER_ID }) })],
            excludedRegions: ["54"],
        })

        const request = shippingTemplateRequestFromForm(shippingTemplateFormFromResponse(response))

        expect(request).toMatchObject({
            freeShipping: false,
            freeOverQuantity: 3,
            freeOverAmount: { amount: 9900, currency: "CNY" },
            defaultRule: {
                firstFee: { amount: 1200, currency: "CNY" },
                addFee: { amount: 500, currency: "CNY" },
            },
            regionRules: [{ regionPrefixes: ["31", "32"] }],
            excludedRegions: ["54"],
        })
    })
})

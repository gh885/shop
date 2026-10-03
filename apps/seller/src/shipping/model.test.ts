import { describe, expect, it } from "vite-plus/test"

import {
    makeShippingFeeTier,
    makeShippingRegionRule,
    makeShippingTemplate,
} from "@shop/test-utils/fixtures"

import {
    shippingTemplateFormFromResponse,
    shippingTemplateRequestFromForm,
    ShippingTemplateRequestSchema,
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
 *
 * wire 那三份夹具住在 `@shop/test-utils/fixtures`（页面接线测试 `shipping-page.test.tsx` 用同一份）：
 * 同一份契约响应在两个文件里各搭一遍，就会被 `shared-vocabulary.test.ts` 那道闸拦下。
 */

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
        const form = shippingTemplateFormFromResponse(makeShippingTemplate())

        expect(form.defaultRule).toEqual({
            firstQuantity: "1",
            firstFee: "12.00",
            addQuantity: "2",
            addFee: "5.00",
        })
    })

    it("包邮门槛缺省：落成空串而不是「undefined」这句会显示进输入框的话", () => {
        const form = shippingTemplateFormFromResponse(makeShippingTemplate())

        expect(form.freeOverQuantity).toBe("")
        expect(form.freeOverAmount).toBe("")
    })

    it("包邮门槛有值：数量走字符串、金额仍走元（回填后二次保存不该把它读成 0）", () => {
        const form = shippingTemplateFormFromResponse(
            makeShippingTemplate({
                freeOverQuantity: 3,
                freeOverAmount: { amount: 9900, currency: "CNY" },
            }),
        )

        expect(form.freeOverQuantity).toBe("3")
        expect(form.freeOverAmount).toBe("99.00")
    })

    it("嵌套的 rule 拍平进表单行，id 只作前端列表 key", () => {
        const form = shippingTemplateFormFromResponse(
            makeShippingTemplate({ regionRules: [makeShippingRegionRule()] }),
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
        const response = makeShippingTemplate({
            regionRules: [makeShippingRegionRule()],
            excludedRegions: ["54"],
        })

        const form = shippingTemplateFormFromResponse(response)
        form.excludedRegions.push("99")
        form.regionRules[0]!.regionPrefixes.push("99")

        expect(response.excludedRegions).toEqual(["54"])
        expect(response.regionRules[0]!.regionPrefixes).toEqual(["31", "32"])
    })
})

/**
 * schema 抛的是**结构化事实**（path + catalog key + params），句子由渲染边界按语言换
 * （见 `packages/app-kit/src/i18n/form-error-translate.test.tsx` 那条通道）。
 * 所以本文件断言的是「哪一格、哪个 key、带什么数」，不再断言中文句子——
 * 把句子写进这里就等于又造了第二份文案，换语言时它既不跟着变也不报错。
 */
function issuesOf(values: ShippingTemplateFormValues) {
    const result = ShippingTemplateRequestSchema.safeParse(values)
    if (result.success) throw new Error("这一组表单值本该被拦下，却通过了校验")
    return result.error.issues.map((issue) => ({
        // 这里是 issue 的原始 path 数组拼的串；表单那边取键用的是方括号形式（i18n.md §6.1）
        path: issue.path.join("."),
        key: issue.message,
        params: issue.code === "custom" ? issue.params : undefined,
    }))
}

describe("ShippingTemplateRequestSchema：校验事实（path + key + params）", () => {
    it("只有默认规则：合法", () => {
        expect(ShippingTemplateRequestSchema.safeParse(makeFormValues()).success).toBe(true)
    })

    /** 无 path 的 issue 在 TanStack 里落进 `errorMap[""]`，页面没有错误位就等于静默隐身 */
    it("每条 issue 都带 path：错总有格子可落", () => {
        const dirty = makeFormValues({
            freeShipping: false,
            freeOverQuantity: "0",
            defaultRule: { ...DEFAULT_TIER, firstFee: "abc" },
            regionRules: [region([]), region(["31"]), region(["31"])],
            excludedRegions: ["31"],
        })
        for (const issue of issuesOf(dirty)) {
            expect(issue.path).not.toBe("")
        }
        expect(issuesOf(dirty).length).toBeGreaterThan(0)
    })

    it("首件数填 0：落在那一格，报「整数 ≥1」那条", () => {
        expect(
            issuesOf(makeFormValues({ defaultRule: { ...DEFAULT_TIER, firstQuantity: "0" } })),
        ).toEqual([
            {
                path: "defaultRule.firstQuantity",
                key: "seller.shipping.err.firstQuantityInt",
                params: undefined,
            },
        ])
    })

    it("首件数填小数：整件数才成立，0.5 件不是运费单位", () => {
        expect(
            issuesOf(makeFormValues({ defaultRule: { ...DEFAULT_TIER, firstQuantity: "0.5" } })),
        ).toEqual([
            {
                path: "defaultRule.firstQuantity",
                key: "seller.shipping.err.firstQuantityInt",
                params: undefined,
            },
        ])
    })

    it("首费填成非数字：报金额格式而不是 NaN", () => {
        expect(
            issuesOf(makeFormValues({ defaultRule: { ...DEFAULT_TIER, firstFee: "abc" } })),
        ).toEqual([
            {
                path: "defaultRule.firstFee",
                key: "seller.shipping.err.firstFeeFormat",
                params: undefined,
            },
        ])
    })

    it("续件/续费各自的格子上报自己的那条，不共用一句", () => {
        const issues = issuesOf(
            makeFormValues({
                defaultRule: { ...DEFAULT_TIER, addQuantity: "0", addFee: "-1" },
            }),
        )
        expect(issues.map((issue) => [issue.path, issue.key])).toEqual([
            ["defaultRule.addQuantity", "seller.shipping.err.addQuantityInt"],
            ["defaultRule.addFee", "seller.shipping.err.addFeeFormat"],
        ])
    })

    it("包邮开关打开时，门槛上的脏值不该拦提交（那些框根本不参与计费）", () => {
        expect(
            ShippingTemplateRequestSchema.safeParse(
                makeFormValues({
                    freeShipping: true,
                    freeOverQuantity: "0",
                    freeOverAmount: "-1",
                }),
            ).success,
        ).toBe(true)
    })

    it("包邮开关关掉时，门槛才受检：满件 0 会让所有单都免邮", () => {
        expect(issuesOf(makeFormValues({ freeShipping: false, freeOverQuantity: "0" }))).toEqual([
            {
                path: "freeOverQuantity",
                key: "seller.shipping.err.freeOverQuantityInt",
                params: undefined,
            },
        ])
    })

    it("指定地区规则一条都没选地区：报第几条（params 带行号，句子由 catalog 排语序）", () => {
        expect(issuesOf(makeFormValues({ regionRules: [region([]), region(["31"])] }))).toEqual([
            {
                path: "regionRules.0.regionPrefixes",
                key: "seller.shipping.err.regionMissing",
                params: { index: 1 },
            },
        ])
    })

    it("同一地区落进两条规则：点名是哪条编码，且报在后出现的那一行上", () => {
        expect(
            issuesOf(makeFormValues({ regionRules: [region(["31"]), region(["31", "32"])] })),
        ).toEqual([
            {
                path: "regionRules.1.regionPrefixes",
                key: "seller.shipping.err.duplicateRegion",
                params: { prefix: "31" },
            },
        ])
    })

    it("地区已配运费又设为不配送：两件事不能同时成立，落在那个不配送选择器上", () => {
        expect(
            issuesOf(
                makeFormValues({
                    regionRules: [region(["31"])],
                    excludedRegions: ["31"],
                }),
            ),
        ).toEqual([
            {
                path: "excludedRegions",
                key: "seller.shipping.err.excludedConflict",
                params: { prefix: "31" },
            },
        ])
    })

    it("不配送是父级编码、运费规则是子级编码：按编码逐个字面比，不做前缀包含判断", () => {
        // 钉住当前实现的边界：31 不配送 + 3101 收费是否会同时提交成功
        expect(
            ShippingTemplateRequestSchema.safeParse(
                makeFormValues({
                    regionRules: [region(["3101"])],
                    excludedRegions: ["31"],
                }),
            ).success,
        ).toBe(true)
    })

    it("地区规则那一行的四格也各自受检（与默认运费同一份规则）", () => {
        expect(
            issuesOf(makeFormValues({ regionRules: [region(["31"], { firstQuantity: "0" })] })),
        ).toEqual([
            {
                path: "regionRules.0.firstQuantity",
                key: "seller.shipping.err.firstQuantityInt",
                params: undefined,
            },
        ])
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
        const response = makeShippingTemplate({
            freeOverQuantity: 3,
            freeOverAmount: { amount: 9900, currency: "CNY" },
            regionRules: [
                makeShippingRegionRule({ rule: makeShippingFeeTier({ id: REGION_TIER_ID }) }),
            ],
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

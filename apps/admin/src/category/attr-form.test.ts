import { describe, expect, it } from "vite-plus/test"

import type { CategoryAttrResponse } from "@shop/api/sdk"
import { makeCategoryAttrNode } from "@shop/test-utils/fixtures"

import { attrFormSchema, describeAttrRules, valueFormSchema } from "./attr-form"

/**
 * 属性模板的两条纯规则：三个开关怎么折成一句摘要，以及两个表单那句「非空」到底拦住了什么。
 * 上限本身不在这里测（它由契约镜像与门禁钉），测的是**契约放行之后**前端还补的那一刀。
 * 摘要是纯函数：句子由外部 `t` 给，这里喂一个照 zh catalog 的假 `t`，测的是拼装顺序与兜底那格。
 */

const attrOf = (overrides: Partial<CategoryAttrResponse> = {}) =>
    makeCategoryAttrNode({ id: "attr-1", ...overrides }, []).attr

const ZH: Record<string, string> = {
    "category.rules.required": "必填",
    "category.rules.allowCustom": "可自定义",
    "category.rules.allowImage": "取值可配图",
    "category.rules.none": "无附加规则",
}
const t = (key: string) => ZH[key] ?? key

describe("describeAttrRules", () => {
    it("一个开关都没开时给「无附加规则」，不留白", () => {
        expect(
            describeAttrRules(
                attrOf({ required: false, allowCustom: false, allowImage: false }),
                t,
            ),
        ).toBe("无附加规则")
    })

    it("按必填 → 可自定义 → 可配图的固定顺序拼，中间用 · 隔开", () => {
        expect(
            describeAttrRules(attrOf({ required: true, allowCustom: true, allowImage: true }), t),
        ).toBe("必填 · 可自定义 · 取值可配图")
        expect(
            describeAttrRules(attrOf({ required: false, allowCustom: true, allowImage: true }), t),
        ).toBe("可自定义 · 取值可配图")
    })

    it("只开一个时也照实说一句（fixtures 默认必填 + 可自定义，关掉后者才看得见单个）", () => {
        expect(
            describeAttrRules(attrOf({ required: true, allowCustom: false, allowImage: false }), t),
        ).toBe("必填")
    })
})

describe("attrFormSchema", () => {
    const base = {
        name: "颜色",
        kind: "SPEC" as const,
        required: false,
        allowCustom: true,
        allowImage: false,
    }

    it("纯空白的名称被拦：契约那格 min(0) 放行，后端 @NotBlank 会回 422", () => {
        expect(attrFormSchema.safeParse({ ...base, name: "   " }).success).toBe(false)
        expect(attrFormSchema.safeParse(base).success).toBe(true)
    })

    it("kind 只认契约那两个档位，缺着或写别的都不给过", () => {
        expect(attrFormSchema.safeParse({ ...base, kind: undefined }).success).toBe(false)
        expect(attrFormSchema.safeParse({ ...base, kind: "COLOR" }).success).toBe(false)
        expect(attrFormSchema.safeParse({ ...base, kind: "PARAM" }).success).toBe(true)
    })

    it("三个开关要的是确定的布尔：契约里它们可选，表单里缺省不许当「未勾选」", () => {
        expect(attrFormSchema.safeParse({ ...base, required: undefined }).success).toBe(false)
    })
})

describe("valueFormSchema", () => {
    it("取值名纯空白被拦，配图允许空串（空串 = 不配图，提交侧折成 null）", () => {
        expect(valueFormSchema.safeParse({ value: "  ", image: "" }).success).toBe(false)
        expect(valueFormSchema.safeParse({ value: "红色", image: "" }).success).toBe(true)
    })

    it("image 那一格的 optional 被 unwrap 掉了：字段必须在场，值可以是空串", () => {
        expect(valueFormSchema.safeParse({ value: "红色" }).success).toBe(false)
    })
})

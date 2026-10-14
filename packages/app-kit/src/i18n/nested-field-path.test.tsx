import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"

import type { I18nResources } from "@shop/i18n"
import { useAppForm } from "@shop/ui-web"

import { I18nProvider } from "./provider"
import { createAppI18n } from "./runtime"

/**
 * 数组里那一格的错误落点。
 *
 * 源码事实：`@tanstack/form-core/dist/esm/standardSchemaValidator.js:13` 把 Zod 的
 * `path: ["rules", 0, "region"]` 拼成 `rules[0].region` 作为取键用的名字。
 * 钉两件事，它们决定运费模板页为什么要拆成逐格 field：
 * A. 按方括号命名的 field 吃到**自己那一格**的错（并且别的行不被串上）；
 * B. 那一格没被渲染成 field 时，错在 errorMap 里躺着、**一句都不显示**——
 *    受控子组件（自己收 value/onChange 的那种）等于把错误丢进黑洞。
 */

const resources = {
    "zh-Hans-CN": {
        "p.err.regionRequired": "该行还没有选择地区",
        "p.err.feeFormat": "{index}号格格式不正确",
    },
} satisfies I18nResources

const schema = z
    .object({
        rules: z.array(z.object({ region: z.string(), fee: z.string() })),
    })
    .superRefine((value, ctx) => {
        value.rules.forEach((rule, index) => {
            if (rule.region === "") {
                ctx.addIssue({
                    code: "custom",
                    path: ["rules", index, "region"],
                    message: "p.err.regionRequired",
                })
            }
            if (rule.fee === "bad") {
                ctx.addIssue({
                    code: "custom",
                    path: ["rules", index, "fee"],
                    message: "p.err.feeFormat",
                    params: { index },
                })
            }
        })
    })

function Harness({ row0AsField }: { row0AsField: boolean }) {
    const form = useAppForm({
        // 第 0 行：地区空 + 费用坏；第 1 行两项都合法（对照组，不许被串上错误）
        defaultValues: {
            rules: [
                { region: "", fee: "bad" },
                { region: "31", fee: "10" },
            ],
        },
        validators: { onSubmit: schema },
        onSubmit: async () => {},
    })
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
            }}
        >
            {row0AsField ? (
                <>
                    <form.AppField name={"rules[0].region"}>
                        {(field) => <field.TextField label="行0地区" />}
                    </form.AppField>
                    <form.AppField name={"rules[0].fee"}>
                        {(field) => <field.TextField label="行0费用" />}
                    </form.AppField>
                </>
            ) : (
                /* B：这一行的两格都没有独立 field，只有一个读数组值的受控块 */
                <form.AppField name="rules">
                    {(field) => (
                        <div>
                            {field.state.value
                                .map((rule) => `${rule.region}/${rule.fee}`)
                                .join(" ")}
                        </div>
                    )}
                </form.AppField>
            )}
            <form.AppField name={"rules[1].region"}>
                {(field) => <field.TextField label="行1地区" />}
            </form.AppField>
            <button type="submit">提交</button>
        </form>
    )
}

function renderForm(row0AsField: boolean) {
    return render(
        <I18nProvider i18n={createAppI18n("zh-Hans-CN", resources)}>
            <Harness row0AsField={row0AsField} />
        </I18nProvider>,
    )
}

describe("数组字段的错误落点", () => {
    it("方括号命名的 field 吃到自己那格的错，params 也一起进来", async () => {
        renderForm(true)
        fireEvent.click(screen.getByRole("button", { name: "提交" }))

        const alerts = await screen.findAllByRole("alert")
        const texts = alerts.map((a) => a.textContent)
        expect(texts).toContain("该行还没有选择地区")
        expect(texts).toContain("0号格格式不正确")
        // 第 1 行两项都合法：错误没有串到别的行
        expect(texts).toHaveLength(2)
    })

    it("那一格没有 field 时，错误静默隐身（所以数组行必须逐格建 field）", async () => {
        renderForm(false)
        fireEvent.click(screen.getByRole("button", { name: "提交" }))

        // 提交被拦住了，可页面上一个字都没有：这就是受控子组件版的失败模式
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(screen.queryAllByRole("alert")).toHaveLength(0)
    })
})

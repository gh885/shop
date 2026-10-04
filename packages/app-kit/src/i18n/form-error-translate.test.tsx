import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"
import { z } from "zod"

import type { I18nResources } from "@shop/common/i18n"
import { Transport, configureMonitoring } from "@shop/common/monitoring"
import { useAppForm } from "@shop/ui-web"
import { applyServerFieldErrors } from "@shop/ui-web"

import { I18nProvider } from "./provider"
import { createAppI18n } from "./runtime"
import { useI18n } from "./use-i18n"
import { serverFieldErrors } from "../forms/server-field-errors"

/**
 * 结构化校验错误的承重链：schema 只抛事实（`message` = catalog key、`params` = 数据），
 * 句子在渲染边界由 app-kit 的 I18nProvider 灌进 ui-web 的翻译器换出来。
 *
 * 钉三件事：
 * 1. key 命中：翻成当前语言的句子，`params` 插得进去；
 * 2. 切语言**不重新校验**，已显示的错当场跟着变——这正是 `makeSchema(t)` 工厂那条做不到的
 *    （schema 冻在创建时的那份 `t` 上，要不变就得重跑校验）；
 * 3. catalog 查不到的 message（没迁移的表单把中文写死在 schema 里、或服务端成品句）原样显示，
 *    且**不报** `i18n_missing_key`——那不是漏 key，报了就是长期噪声。
 */

const resources = {
    "zh-CN": {
        "form.err.tooLong": "最多 {max} 字",
    },
    "en-US": {
        "form.err.tooLong": "at most {max} characters",
    },
} satisfies I18nResources

const schema = z
    .object({ name: z.string(), legacy: z.string() })
    .refine((v) => v.name.length <= 3, {
        path: ["name"],
        message: "form.err.tooLong",
        params: { max: 3 },
    })
    .refine((v) => v.legacy.length <= 3, {
        // 故意用一个 catalog 里没有的 message：模拟没迁移的表单
        path: ["legacy"],
        message: "not-a-catalog-key",
    })

function Harness() {
    const form = useAppForm({
        defaultValues: { name: "toolong", legacy: "alsotoolong" },
        validators: { onSubmit: schema },
        onSubmit: async () => {},
    })
    return (
        <>
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    void form.handleSubmit()
                }}
            >
                <form.AppField name="name">
                    {(field) => <field.TextField label="名称" />}
                </form.AppField>
                <form.AppField name="legacy">
                    {(field) => <field.TextField label="旧" />}
                </form.AppField>
                <button type="submit">提交</button>
            </form>
            <LocaleSwitch />
        </>
    )
}

/** 服务端 422 那条通道：表单拿到的是**事实**（key + params），不是提前翻好的句子 */
function ServerErrorHarness() {
    const form = useAppForm({
        defaultValues: { name: "" },
        onSubmit: async () => {
            // 形态与真实提交一致：提交失败 → serverFieldErrors 落框（真实表单还会把错误抛给 submitForm，
            // 那一半与本用例无关，所以这里不抛，免得测试里多一个未处理的 rejection）
            applyServerFieldErrors(
                form,
                serverFieldErrors(
                    {
                        status: 422,
                        detail: "输入校验失败（1 个字段错误）",
                        errors: [
                            {
                                field: "name",
                                message: "长度不能超过 30 个字符",
                                rule: "MAX_LENGTH",
                                max: 30,
                            },
                        ],
                    },
                    { name: "name" },
                ),
            )
        },
    })
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                void form.handleSubmit()
            }}
        >
            <form.AppField name="name">{(field) => <field.TextField label="名称" />}</form.AppField>
            <button type="submit">提交</button>
        </form>
    )
}

function LocaleSwitch() {
    const { setLocale } = useI18n()
    return (
        <button
            type="button"
            onClick={() => setLocale("en-US")}
        >
            切英文
        </button>
    )
}
function Provider({ children }: { children: React.ReactNode }) {
    return <I18nProvider i18n={createAppI18n("zh-CN", resources)}>{children}</I18nProvider>
}

describe("结构化校验错误 → 渲染边界翻译", () => {
    it("key 命中：翻成当前语言的句子，params 插进去", async () => {
        render(
            <Provider>
                <Harness />
            </Provider>,
        )
        fireEvent.click(screen.getByRole("button", { name: "提交" }))

        const alerts = await screen.findAllByRole("alert")
        expect(alerts.map((a) => a.textContent)).toContain("最多 3 字")
    })

    it("切语言不重新校验，已显示的错当场变成新语言", async () => {
        render(
            <Provider>
                <Harness />
            </Provider>,
        )
        fireEvent.click(screen.getByRole("button", { name: "提交" }))
        await screen.findByText("最多 3 字")

        fireEvent.click(screen.getByRole("button", { name: "切英文" }))

        // 没有第二次提交：换句子的是渲染边界那一层，schema 与已产出的错误对象都没动过
        expect(await screen.findByText("at most 3 characters")).toBeInTheDocument()
        expect(screen.queryByText("最多 3 字")).not.toBeInTheDocument()
    })

    it("结构化 message 查不到：返回 key 并上报，裸串兼容不混入查找", async () => {
        const sent: unknown[] = []
        const transport = new Transport({
            send: (_endpoint, body) => {
                // 数组守卫而不是断言：从 any 断言会吃 no-unsafe-type-assertion，仓库的告警预算不给这条新增
                const events = JSON.parse(body)
                if (Array.isArray(events)) sent.push(...events)
                return true
            },
        })
        configureMonitoring({ app: "seller", enabled: true, transport })

        render(
            <Provider>
                <Harness />
            </Provider>,
        )
        fireEvent.click(screen.getByRole("button", { name: "提交" }))

        const alerts = await screen.findAllByRole("alert")
        expect(alerts.map((a) => a.textContent)).toContain("not-a-catalog-key")

        transport.flush()
        configureMonitoring({ app: "seller", enabled: false, transport })

        expect(
            sent.filter((event) => JSON.stringify(event).includes("not-a-catalog-key")),
        ).toHaveLength(1)
    })
})

describe("服务端字段级错误：与本地校验走同一条道", () => {
    it("句子在渲染时出：切语言后已显示的服务端错误也跟着变（改版前它冻在提交那一刻的语言上）", async () => {
        render(
            <Provider>
                <ServerErrorHarness />
                <LocaleSwitch />
            </Provider>,
        )
        fireEvent.click(screen.getByRole("button", { name: "提交" }))

        // 中文界面走 catalog 那句，不是后端注解上那句成品中文
        expect(await screen.findByText("最长 30 个字")).toBeInTheDocument()

        fireEvent.click(screen.getByRole("button", { name: "切英文" }))

        expect(await screen.findByText("Must be at most 30 characters.")).toBeInTheDocument()
        expect(screen.queryByText("最长 30 个字")).not.toBeInTheDocument()
    })
})

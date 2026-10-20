import { messageFactFactory } from "@shop/i18n"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"
import { ErrorCodes } from "@shop/common/contract"
import { createMonitor, flushMonitoring } from "@shop/monitoring"
import { translate, type I18nResources } from "@shop/i18n"
import { Toaster } from "@shop/ui-web"

import { createAppI18n } from "../i18n/runtime"
import { bindNotifyI18n, notify } from "./notify"

/** notify.fromError 取文案链（§7.3）：断言用户看得见的那句、不是读了 detail 还是 code；每条用例 detail 与 catalog 刻意不同，否则断言空转 */
const renderToaster = () => render(<Toaster />)

describe("notify.fromError 按 code 取 catalog", () => {
    it("已知 code：中文界面弹 catalog 那句，不是后端 detail", async () => {
        renderToaster()

        notify.fromError(
            { status: 400, code: "SMS_CODE_EXPIRED", detail: "后端那句话说的是已过期" },
            "zh-Hans-CN",
        )

        expect(await screen.findByText("验证码已失效，请重新获取")).toBeInTheDocument()
        expect(screen.queryByText("后端那句话说的是已过期")).not.toBeInTheDocument()
    })

    it("同一个 code 切到英文：弹英文 catalog，不再漏出中文 detail", async () => {
        renderToaster()

        notify.fromError(
            { status: 400, code: "SMS_CODE_EXPIRED", detail: "中文细节该进日志不该进这里" },
            "en-US",
        )

        expect(
            await screen.findByText("This code is no longer valid. Please request a new one."),
        ).toBeInTheDocument()
        expect(screen.queryByText("中文细节该进日志不该进这里")).not.toBeInTheDocument()
    })

    // 地址上限码（参数化通道的唯一样例）：上限由 params.limit 给，两种语言都弹 catalog（英文那句带后端数字、非写死字面量）
    const PARAM_CASES = [
        {
            code: ErrorCodes.ADDRESS_LIMIT_EXCEEDED,
            detail: "最多保存 20 条收货地址",
            params: { limit: 20 },
            zh: "最多保存 20 条收货地址",
            en: "You can save up to 20 shipping addresses.",
        },
        {
            code: ErrorCodes.MERCHANT_ADDRESS_LIMIT_EXCEEDED,
            detail: "最多添加 200 条地址",
            params: { limit: 200 },
            zh: "最多添加 200 条地址",
            en: "You can add up to 200 addresses.",
        },
    ] as const

    for (const { code, detail, params, zh, en } of PARAM_CASES) {
        it(`${code}：两种语言都弹 catalog，上限由 params 填`, async () => {
            renderToaster()

            notify.fromError({ status: 400, code, detail, params }, "zh-Hans-CN")
            expect(await screen.findByText(zh)).toBeInTheDocument()

            notify.fromError({ status: 400, code, detail, params }, "en-US")
            expect(await screen.findByText(en)).toBeInTheDocument()
        })

        it(`${code}：params 缺失时不弹裸槽位（降级到通用句）`, async () => {
            renderToaster()

            notify.fromError({ status: 400, code, detail }, "en-US")
            expect(
                await screen.findByText(
                    "The request could not be completed. Please check your input and try again.",
                ),
            ).toBeInTheDocument()
            expect(screen.queryByText(/{/)).not.toBeInTheDocument()
        })
    }

    // COM-01 后违禁码退出 detail 优先：命中词改由字段级明细交表单（errors[].value → product.publish.forbiddenWordHit），toast 一律取 catalog，词没丢只是标在输入框上
    it("FORBIDDEN_WORD_HIT：两种语言都弹 catalog，后端那句中文不进界面", async () => {
        renderToaster()
        const detail = "「标题」包含违禁词「最佳」（分类：广告法用语），请修改后重新提交"

        notify.fromError({ status: 400, code: ErrorCodes.FORBIDDEN_WORD_HIT, detail }, "zh-Hans-CN")
        expect(await screen.findByText("内容包含违禁词，请修改后重新提交")).toBeInTheDocument()
        expect(screen.queryByText(detail)).not.toBeInTheDocument()

        notify.fromError({ status: 400, code: ErrorCodes.FORBIDDEN_WORD_HIT, detail }, "en-US")
        expect(
            await screen.findByText(
                "Your content contains a prohibited term. Please revise and submit again.",
            ),
        ).toBeInTheDocument()
    })

    it("没登记的 code：中文界面回退 detail，英文界面按状态码给通用句", async () => {
        renderToaster()

        notify.fromError(
            { status: 400, code: "SOME_NEW_BACKEND_CODE", detail: "还没配文案的那句" },
            "zh-Hans-CN",
        )
        expect(await screen.findByText("还没配文案的那句")).toBeInTheDocument()

        notify.fromError(
            { status: 409, code: "SOME_NEW_BACKEND_CODE", detail: "还没配文案的 409" },
            "en-US",
        )
        expect(
            await screen.findByText(
                "This action conflicts with the current state. Please refresh and try again.",
            ),
        ).toBeInTheDocument()
    })

    it("没有后端响应（status 0）：调用方场景文案优先，没给则弹通用网络提示", async () => {
        renderToaster()

        notify.fromError(new Error("network down"), "zh-Hans-CN", message("test.scenario-copy"))
        expect(await screen.findByText("test.scenario-copy")).toBeInTheDocument()

        notify.fromError(new Error("network down"), "zh-Hans-CN")
        expect(await screen.findByText("操作失败，请稍后重试")).toBeInTheDocument()

        notify.fromError(new Error("network down"), "en-US")
        expect(
            await screen.findByText("Something went wrong. Please try again later."),
        ).toBeInTheDocument()
    })

    // 兜底记账（升级判据见「错误码判据」）：只报「该有 code 却没有」，catalog 命中/后端没说话都不报，否则掺噪声
    // 硬要求：走 track 不走 captureError（后者限次 3 条毁掉频次信号），source/status/code 必须结构化不拼进 message
    it("走了 detail / 状态码兜底各报一条，且报的是结构化 fallback 而不是 error", async () => {
        // 装配收在这条用例里：出口的队列是模块级单例，跨用例共享会把别处的兜底一起冲出来
        const sent: Record<string, unknown>[] = []
        // 假「最后一跳」。body 是事件对象数组（不是字符串数组——双重编码会让 body 大一倍）
        const send = (_endpoint: string, body: string): boolean => {
            for (const event of JSON.parse(body) as Record<string, unknown>[]) sent.push(event)
            return true
        }
        // 不装默认插件：测试里不要挂真的 window 监听，jsdom 自身的错误会污染断言
        createMonitor({ app: "web", enabled: true, send, integrations: () => [] })

        renderToaster()

        notify.fromError({ status: 400, detail: "没 code 的中文句" }, "zh-Hans-CN")
        notify.fromError({ status: 422, detail: "输入校验失败（3 个字段错误）" }, "en-US")
        notify.fromError({ status: 400, code: "SMS_CODE_INVALID", detail: "已登记" }, "en-US")
        notify.fromError(new Error("network down"), "en-US")

        await screen.findByText("没 code 的中文句")
        flushMonitoring()
        createMonitor({ app: "web", enabled: false, send, integrations: () => [] })

        const fallbacks = sent.filter((event) => event.kind === "fallback")
        expect(fallbacks).toHaveLength(2)
        expect(fallbacks[0]).toMatchObject({ source: "detail", status: 400, route: "/" })
        expect(fallbacks[1]).toMatchObject({ source: "status", status: 422 })
        // 反向：它绝不能同时以 error 形态出现——那意味着又回到了被限次截断的那条路
        expect(sent.filter((event) => event.kind === "error")).toHaveLength(0)
    })
})

const someAsyncWork = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** 组件内直接 notify 的异步路径（不走 MutationCache，如登录表单 await submit 后再弹）：钉「渲染期捕获的 t/locale 会过期」——发起时 zh、请求期切 en，完成时须弹 en；急翻译则停在 zh */
describe("notify 直接调用 · 异步路径按完成时语言现读", () => {
    const MESSAGES: I18nResources = {
        "zh-Hans-CN": { "toast.saved": "已保存" },
        "en-US": { "toast.saved": "Saved" },
    }

    it("请求发出后切语言，完成时的 toast 用新语言、不是发起时捕获的那份", async () => {
        const i18n = createAppI18n("zh-Hans-CN", MESSAGES)
        bindNotifyI18n(i18n)
        render(<Toaster />)

        // 发起时刻按当时语言（zh）拿到的成品句——旧写法会把这个冻结进闭包
        const staleFromInitTime = translate(i18n, "toast.saved")

        await someAsyncWork()
        void i18n.changeLanguage("en-US")
        notify.success(message("toast.saved"))

        expect(await screen.findByText("Saved")).toBeInTheDocument()
        expect(screen.queryByText(staleFromInitTime)).not.toBeInTheDocument()
    })

    it("fromError 缺省 locale 时按注入实例现读（异步 catch 路径）", async () => {
        const i18n = createAppI18n("zh-Hans-CN", MESSAGES)
        bindNotifyI18n(i18n)
        render(<Toaster />)

        void i18n.changeLanguage("en-US")
        // 已知 code：en 界面走 catalog 那句英文，不弹后端中文 detail（§7.3）
        notify.fromError({ status: 400, code: "SMS_CODE_EXPIRED", detail: "中文细节该进日志" })

        expect(
            await screen.findByText("This code is no longer valid. Please request a new one."),
        ).toBeInTheDocument()
        expect(screen.queryByText("中文细节该进日志")).not.toBeInTheDocument()
    })
})

const message = messageFactFactory<"test.scenario-copy" | "toast.saved", Record<never, never>>()

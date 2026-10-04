import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"
import { ErrorCodes } from "@shop/common/contract"
import { Transport, configureMonitoring } from "@shop/common/monitoring"
import { translate, type I18nResources } from "@shop/common/i18n"
import { Toaster } from "@shop/ui-web"

import { createAppI18n } from "../i18n/runtime"
import { bindNotifyI18n, notify } from "./notify"

/**
 * `notify.fromError` 的取文案链（§7.3）。断言的是**用户看得见的那句**，不是「读了 detail 还是
 * 读了 code」——后者换实现就红而用户没变，前者才是这条链要守的后果。
 *
 * 每条用例的 detail 与 catalog 句子刻意不同，否则「显示的是 catalog」与「显示的是 detail」
 * 在两种语言下都可能长得一样，断言就空转了。
 */
const renderToaster = () => render(<Toaster />)

describe("notify.fromError 按 code 取 catalog", () => {
    it("已知 code：中文界面弹 catalog 那句，不是后端 detail", async () => {
        renderToaster()

        notify.fromError(
            { status: 400, code: "SMS_CODE_EXPIRED", detail: "后端那句话说的是已过期" },
            "zh-CN",
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

    /**
     * 两条地址上限码（参数化通道的唯一样例）：上限住在后端常量里，以 `params.limit` 出一次。
     * 两种语言都弹 catalog——中文那句与后端 detail 同义，但 catalog 是本地化的唯一出口；
     * 英文那句带的是**后端给的那个数字**，不是 catalog 里写死的字面量。
     */
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

            notify.fromError({ status: 400, code, detail, params }, "zh-CN")
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

    /**
     * COM-01 参数通道落地后违禁码退出 detail 优先：命中词改由字段级明细交给表单
     * （`errors[].value` → 卖家端 `product.publish.forbiddenWordHit`），toast 这一发两种语言一律取 catalog。
     * 中文界面因此少说那个词——换来的是「一处取文案的路」，且词并没有丢，它标在输入框上。
     */
    it("FORBIDDEN_WORD_HIT：两种语言都弹 catalog，后端那句中文不进界面", async () => {
        renderToaster()
        const detail = "「标题」包含违禁词「最佳」（分类：广告法用语），请修改后重新提交"

        notify.fromError({ status: 400, code: ErrorCodes.FORBIDDEN_WORD_HIT, detail }, "zh-CN")
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
            "zh-CN",
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

        notify.fromError(new Error("network down"), "zh-CN", { key: "test.scenario-copy" })
        expect(await screen.findByText("test.scenario-copy")).toBeInTheDocument()

        notify.fromError(new Error("network down"), "zh-CN")
        expect(await screen.findByText("操作失败，请稍后重试")).toBeInTheDocument()

        notify.fromError(new Error("network down"), "en-US")
        expect(
            await screen.findByText("Something went wrong. Please try again later."),
        ).toBeInTheDocument()
    })

    /**
     * 兜底记账（docs/error-codes.md 的升级判据靠它）：哪句该有 code 却没有，由真实频次说。
     * catalog 命中与「后端没说话」不是欠账，不许报——报了指标就掺噪声。
     *
     * 两条形状上的硬要求，各自对应一个会把数据毁掉的机制：
     * 1. **走 `track` 不走 `captureError`**——后者按指纹限次 3 条，而这条信号的全部价值是频次；
     * 2. **字段结构化**——`source` / `status` / `code` 不许拼进 message 的自由文本，否则接收端
     *    只能正则捞，也就没法当维度聚合。
     */
    it("走了 detail / 状态码兜底各报一条，且报的是结构化 fallback 而不是 error", async () => {
        // 装配收在这条用例里：Transport 的队列是模块级单例，跨用例共享会把别处的兜底一起冲出来
        const sent: Record<string, unknown>[] = []
        const transport = new Transport({
            send: (_endpoint, body) => {
                // body 是事件对象数组（不是字符串数组——双重编码会让 body 大一倍）
                for (const event of JSON.parse(body) as Record<string, unknown>[]) sent.push(event)
                return true
            },
        })
        configureMonitoring({ app: "web", enabled: true, transport })

        renderToaster()

        notify.fromError({ status: 400, detail: "没 code 的中文句" }, "zh-CN")
        notify.fromError({ status: 422, detail: "输入校验失败（3 个字段错误）" }, "en-US")
        notify.fromError({ status: 400, code: "SMS_CODE_INVALID", detail: "已登记" }, "en-US")
        notify.fromError(new Error("network down"), "en-US")

        await screen.findByText("没 code 的中文句")
        transport.flush()
        configureMonitoring({ app: "web", enabled: false, transport })

        const fallbacks = sent.filter((event) => event.kind === "fallback")
        expect(fallbacks).toHaveLength(2)
        expect(fallbacks[0]).toMatchObject({ source: "detail", status: 400, route: "/" })
        expect(fallbacks[1]).toMatchObject({ source: "status", status: 422 })
        // 反向：它绝不能同时以 error 形态出现——那意味着又回到了被限次截断的那条路
        expect(sent.filter((event) => event.kind === "error")).toHaveLength(0)
    })
})

/** 模拟「请求发出 → 等待结果」的异步间隙 */
const someAsyncWork = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * 组件内**直接 notify** 的异步路径（不走全局 MutationCache，如登录表单 `await submit` 后再弹）。
 * `mutation-feedback.test.tsx` 那条钉的是 MutationCache 现读；这条钉的是「渲染期捕获的 t/locale 会过期」
 * 这个 bug 本身：发起时刻按 zh 拿到成品句，请求期间切到 en，完成时 `notify.success({ key })` 必须弹 en。
 * 沿用旧写法（把 `t()` 的成品串传进 notify）弹的就是发起时那份 zh——正是主人验收要堵的路径。
 */
describe("notify 直接调用 · 异步路径按完成时语言现读", () => {
    const MESSAGES: I18nResources = {
        "zh-CN": { "toast.saved": "已保存" },
        "en-US": { "toast.saved": "Saved" },
    }

    it("请求发出后切语言，完成时的 toast 用新语言、不是发起时捕获的那份", async () => {
        const i18n = createAppI18n("zh-CN", MESSAGES)
        bindNotifyI18n(i18n)
        render(<Toaster />)

        // 发起时刻按当时语言（zh）拿到的成品句——旧写法会把这个冻结进闭包
        const staleFromInitTime = translate(i18n, "toast.saved")

        // 请求发出 → 等待期间切语言 → 收到结果才 notify
        await someAsyncWork()
        void i18n.changeLanguage("en-US")
        notify.success({ key: "toast.saved" })

        expect(await screen.findByText("Saved")).toBeInTheDocument()
        expect(screen.queryByText(staleFromInitTime)).not.toBeInTheDocument()
    })

    it("fromError 缺省 locale 时按注入实例现读（异步 catch 路径）", async () => {
        const i18n = createAppI18n("zh-CN", MESSAGES)
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

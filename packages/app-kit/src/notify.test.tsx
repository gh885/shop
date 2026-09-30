import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"
import { ErrorCodes, Transport, configureMonitoring } from "@shop/common"
import { Toaster } from "@shop/ui-web"

import { DETAIL_FIRST_CODES } from "./i18n/error-keys"
import { notify } from "./notify"

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
     * 两个 detail 优先码：detail 那句与 catalog 的英文句**必须不同**，否则这条测的是空话。
     * 中文界面要具体（上限数字），英文界面要语言正确——宁可少说一个数字。
     */
    const DETAIL_FIRST_CASES = [
        {
            code: ErrorCodes.ADDRESS_LIMIT_EXCEEDED,
            detail: "最多保存 20 条收货地址",
            catalog: "You can save up to 20 shipping addresses.",
        },
        {
            code: ErrorCodes.MERCHANT_ADDRESS_LIMIT_EXCEEDED,
            detail: "最多添加 200 条地址",
            catalog: "You can add up to 200 addresses.",
        },
    ] as const

    it("例外清单与用例表同源：加了 detail 优先码却不加用例，这条先红", () => {
        expect([...DETAIL_FIRST_CODES].toSorted()).toEqual(
            DETAIL_FIRST_CASES.map((c) => c.code).toSorted(),
        )
    })

    for (const { code, detail, catalog } of DETAIL_FIRST_CASES) {
        it(`${code}：中文界面弹后端那句具体的`, async () => {
            renderToaster()

            notify.fromError({ status: 400, code, detail }, "zh-CN")

            expect(await screen.findByText(detail)).toBeInTheDocument()
        })

        it(`${code}：英文界面弹 catalog 占位——少说一个数字，也不混语种`, async () => {
            renderToaster()

            notify.fromError({ status: 400, code, detail }, "en-US")

            expect(await screen.findByText(catalog)).toBeInTheDocument()
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

        notify.fromError(new Error("network down"), "zh-CN", "这一格的场景文案")
        expect(await screen.findByText("这一格的场景文案")).toBeInTheDocument()

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
     */
    it("走了 detail / 状态码兜底各报一条，catalog 命中与网络错误不报", async () => {
        // 装配收在这条用例里：Transport 的队列是模块级单例，跨用例共享会把别处的兜底一起冲出来
        const sent: Record<string, unknown>[] = []
        const transport = new Transport({
            send: (_endpoint, body) => {
                // body 是「已逐条序列化的事件数组」的再序列化，所以每个元素是 JSON 字符串
                for (const raw of JSON.parse(body) as string[]) sent.push(JSON.parse(raw))
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

        const errors = sent.filter((e) => e.kind === "error")
        expect(errors).toHaveLength(2)
        expect((errors[0] as { message: string }).message).toContain("source=detail status=400")
        expect((errors[1] as { message: string }).message).toContain("source=status status=422")
    })
})

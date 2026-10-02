import { AddressesApi } from "@shop/api/sdk"
import { DEFAULT_LOCALE, PLATFORM_TIME_ZONE, resolveLocale } from "@shop/common/i18n"
import { server } from "@shop/test-utils"
import { describe, expect, it } from "vite-plus/test"
import { http, HttpResponse } from "msw"

// oxlint-disable-next-line import/no-unassigned-import -- 只要它的装配副作用：把 contextHeaders（从 localeScope 拼请求头）装到 SDK client 上
import "#/shared/api/client"

/**
 * §3.5 那条「不允许跨请求共享的可变 locale」的并发契约测。
 *
 * 缺陷原来的样子：出站 `Accept-Language` 取自进程级 `getCurrentLocale()`，两条请求一旦交错，
 * 后解析的那条会把自己的语言写进那个变量，前一条在 await 之后发出的请求就带着别人的语言出去。
 * 这条用例先以正向断言写成红（收到的是 `{A: "zh-CN", …}`），P0′-5 删掉进程级变量后翻成正向形态。
 *
 * 现在测的两件事，缺一不可：
 * 1. **请求自带的 locale 上路**：谁解析出什么就发什么，与别的请求何时发过无关；
 * 2. **显式头压过装配默认**：`contextHeaders` 读的是装配处那个 `localeScope`，SSR 下没人写它
 *    （Provider 的 effect 不在服务端跑），所以不带显式头的那条只能拿到平台默认值——
 *    它既是 §9 P3′-a 要处理的「服务端按请求解析语言」还没做完的记录，也钉住了优先级顺序。
 *
 * 每条请求带一个自标识头 `x-flow`，handler 按它记账：谁先落地不影响断言。
 */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 一条服务端渲染请求：解析 locale → 中间有 await（取数）→ 把自己的语言随请求发出去 */
async function ssrRequest(flow: string, acceptLanguage: string, holdMs: number) {
    const locale = resolveLocale([acceptLanguage])
    await sleep(holdMs)
    return AddressesApi.listAddresses({ headers: { "x-flow": flow, "Accept-Language": locale } })
}

describe("出站 locale 头的请求隔离", () => {
    it("交错的请求各带各的语言：后一条解析出的语言顶不掉前一条的出站头", async () => {
        const sent = new Map<string, string | null>()
        server.use(
            http.get("*/user/addresses", ({ request }) => {
                sent.set(
                    request.headers.get("x-flow") ?? "(无标识)",
                    request.headers.get("accept-language"),
                )
                return HttpResponse.json([])
            }),
        )

        // A 解析 en-US 后要等 5ms 才发请求；B 在这 5ms 里解析 zh-CN。
        await Promise.all([ssrRequest("A", "en-US", 5), ssrRequest("B", "zh-CN", 0)])
        // 没带显式头的那条：只能落到装配处的默认语言
        await AddressesApi.listAddresses({ headers: { "x-flow": "C" } })

        expect(Object.fromEntries(sent)).toEqual({ A: "en-US", B: "zh-CN", C: DEFAULT_LOCALE })
    })

    it("出站恒带 X-Timezone=平台时区：不随语言变，也不随请求变（i18n.md §7.2）", async () => {
        const zones = new Map<string, string | null>()
        server.use(
            http.get("*/user/addresses", ({ request }) => {
                zones.set(
                    request.headers.get("x-flow") ?? "(无标识)",
                    request.headers.get("x-timezone"),
                )
                return HttpResponse.json([])
            }),
        )

        // 两条不同语言 + 一条不带语言：时区维度与语言无关，三条都得是平台时区
        await Promise.all([ssrRequest("A", "en-US", 1), ssrRequest("B", "zh-CN", 0)])
        await AddressesApi.listAddresses({ headers: { "x-flow": "C" } })

        expect(Object.fromEntries(zones)).toEqual({
            A: PLATFORM_TIME_ZONE,
            B: PLATFORM_TIME_ZONE,
            C: PLATFORM_TIME_ZONE,
        })
    })
})

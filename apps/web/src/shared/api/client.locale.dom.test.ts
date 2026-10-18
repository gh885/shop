import { AddressesApi } from "@shop/api/sdk"
import { DEFAULT_LOCALE, PLATFORM_TIME_ZONE, resolveLocale } from "@shop/i18n"
import { server } from "@shop/test-utils"
import { describe, expect, it } from "vite-plus/test"
import { http, HttpResponse } from "msw"

// oxlint-disable-next-line import/no-unassigned-import -- 只要它的装配副作用：把 contextHeaders（从 localeScope 拼请求头）装到 SDK client 上
import "#/shared/api/client"

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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

        await Promise.all([ssrRequest("A", "en-US", 5), ssrRequest("B", "zh-Hans-CN", 0)])
        await AddressesApi.listAddresses({ headers: { "x-flow": "C" } })

        expect(Object.fromEntries(sent)).toEqual({ A: "en-US", B: "zh-Hans-CN", C: DEFAULT_LOCALE })
    })

    it("出站恒带 X-Timezone=平台时区：不随语言变，也不随请求变", async () => {
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

        await Promise.all([ssrRequest("A", "en-US", 1), ssrRequest("B", "zh-Hans-CN", 0)])
        await AddressesApi.listAddresses({ headers: { "x-flow": "C" } })

        expect(Object.fromEntries(zones)).toEqual({
            A: PLATFORM_TIME_ZONE,
            B: PLATFORM_TIME_ZONE,
            C: PLATFORM_TIME_ZONE,
        })
    })
})

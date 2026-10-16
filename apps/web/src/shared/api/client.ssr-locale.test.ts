import { AddressesApi } from "@shop/api/sdk"
import { server } from "@shop/test-utils"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { http, HttpResponse } from "msw"

const current = vi.hoisted(() => ({ req: undefined as Request | undefined }))

vi.mock("@tanstack/react-start/server", () => ({
    getRequest: () => {
        if (!current.req) throw new Error("不在请求上下文里")
        return current.req
    },
    getCookie: (name: string) => {
        const row = current.req?.headers
            .get("cookie")
            ?.split("; ")
            .find((r) => r.startsWith(`${name}=`))
        return row ? decodeURIComponent(row.slice(name.length + 1)) : undefined
    },
}))

// oxlint-disable-next-line import/no-unassigned-import -- 装配副作用：把读 locale 的 contextHeaders 装到 SDK client 上
import "#/shared/api/client"

async function outboundLocale(
    cookieLocale?: string,
    acceptLanguage?: string,
    pathname = "/",
): Promise<string | null> {
    const headers = new Headers()
    if (cookieLocale) headers.set("cookie", `locale=${cookieLocale}`)
    if (acceptLanguage) headers.set("accept-language", acceptLanguage)
    current.req = new Request("http://localhost" + pathname, { headers })

    const sent: { value: string | null } = { value: null }
    server.use(
        http.get("*/user/addresses", ({ request }) => {
            sent.value = request.headers.get("accept-language")
            return HttpResponse.json([])
        }),
    )
    await AddressesApi.listAddresses()
    return sent.value
}

describe("SSR 出站 locale 头按当前请求解析", () => {
    afterEach(() => {
        current.req = undefined
    })

    it("URL 优先于 cookie，语言跟着每条请求现读", async () => {
        expect(await outboundLocale("zh-Hans-CN", "zh-Hans-CN", "/en-US/welcome")).toBe("en-US")
        expect(await outboundLocale("en-US", "en-US", "/zh-Hans-CN/welcome")).toBe("zh-Hans-CN")
        expect(await outboundLocale("en-US")).toBe("en-US")
        expect(await outboundLocale("zh-Hans-CN")).toBe("zh-Hans-CN")
    })

    it("无 cookie 时落 Accept-Language", async () => {
        expect(await outboundLocale(undefined, "en-US")).toBe("en-US")
    })
})

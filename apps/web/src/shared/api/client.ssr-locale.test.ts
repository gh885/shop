import { AddressesApi } from "@shop/api/sdk"
import { server } from "@shop/test-utils"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { http, HttpResponse } from "msw"

/**
 * i18n.md §5.2 的服务端分支：SSR 出站 `Accept-Language` 按**当前请求**取，而不是装配时冻结的进程值。
 *
 * `createIsomorphicFn` 的服务端分支靠 `@tanstack/react-start/server` 的 `getRequest()`（AsyncLocalStorage）
 * 读请求；单测没有真服务端在跑，这里用可变替身喂「此刻是哪条请求」。要钉的是改造前后那条分野：
 * - 旧：`contextHeaders` 读进程级 `localeScope`，SSR 下没人写它 → 无论谁请求都发平台默认值；
 * - 新：每次调用现读当前请求，两条请求头语言不同就各发各的。
 *
 * 用**顺序**两跳（而非并发交错）：并发交错要真 ALS 作用域才能证独立，而这里的关键命题是
 * 「出站头 = 现读的请求，不是模块加载时冻的那个值」——换 `current` 后第二跳若还发第一跳的语言即为坏。
 */
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

/** 把「当前请求」设成带某语言（优先 cookie，否则 Accept-Language），返回那一条 SDK 请求实际发出的语言 */
async function outboundLocale(
    cookieLocale?: string,
    acceptLanguage?: string,
): Promise<string | null> {
    const headers = new Headers()
    if (cookieLocale) headers.set("cookie", `locale=${cookieLocale}`)
    if (acceptLanguage) headers.set("accept-language", acceptLanguage)
    current.req = new Request("http://localhost/", { headers })

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

    it("cookie 决定语言，跟着每条请求现读，不被上一条冻住", async () => {
        expect(await outboundLocale("en-US")).toBe("en-US")
        // 换一个「当前请求」再发一条：若 contextHeaders 是模块加载时算死的，这条仍会是 en-US
        expect(await outboundLocale("zh-CN")).toBe("zh-CN")
    })

    it("无 cookie 时落 Accept-Language", async () => {
        expect(await outboundLocale(undefined, "en-US")).toBe("en-US")
    })
})

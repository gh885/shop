import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vite-plus/test"

import { type AuthStatus } from "@shop/client"
import { createMonitor, flushMonitoring, type MonitoringEvent, track } from "@shop/monitoring"
import { I18nProvider } from "../i18n/provider"
import { createAppI18n } from "../i18n/runtime"
import { createMeQuery } from "./me-query"

/** me 顺带把 userId 填进监控信封（frontend-monitoring 契约第 1 条）——坏了也不报错，故钉「到达后有 id / 登出后清空」两条，断言从真发出的事件里读 */

const ME = { id: "u-1" }

const resources = {
    "zh-Hans-CN": { "confirm.cancel": "取消", "confirm.confirm": "确定" },
    "en-US": { "confirm.cancel": "Cancel", "confirm.confirm": "OK" },
}

/** 已发出的事件。装配是单例的、信封是模块级状态，所以整个文件共用一套 */
let sent: MonitoringEvent[] = []

/** 假「最后一跳」。body 是事件对象数组（不是字符串数组——双重编码会让 body 大一倍） */
const send = (_endpoint: string, body: string): boolean => {
    sent.push(...(JSON.parse(body) as MonitoringEvent[]))
    return true
}

beforeEach(() => {
    sent = []
    // integrations 传空：只测信封里的 userId，不真挂 window 监听，顺带把 userId 复位成 undefined
    createMonitor({ app: "web", send, integrations: () => [], enabled: true })
})

function envelopeUserId(): string | undefined {
    const before = sent.length
    track({ kind: "route", to: "/probe" })
    // createMonitor 传了 enabled: true，track 会真的入队；这里把它推出去才读得到
    flushMonitoring()
    return sent.slice(before).at(-1)?.userId
}

/** 渲染器：useMe 要在 I18nProvider 内、且受 authed 门控 */
function makeWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    const i18n = createAppI18n("zh-Hans-CN", resources)
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <I18nProvider i18n={i18n}>{children}</I18nProvider>
        </QueryClientProvider>
    )
    return { queryClient, Wrapper }
}

describe("createMeQuery 的监控 userId", () => {
    it("me 到达后信封里带上 id", async () => {
        const { Wrapper } = makeWrapper()
        const me = createMeQuery<typeof ME | undefined>({
            scope: "me",
            queryFn: () => Promise.resolve(ME),
            useAuthStatus: (): AuthStatus => "authed",
            userIdOf: (value) => value?.id,
        })

        renderHook(() => me.useMe(), { wrapper: Wrapper })

        await waitFor(() => {
            expect(envelopeUserId()).toBe("u-1")
        })
    })

    it("me 变 undefined（登出）后自动清空：各端不靠记得在登出处调一次", async () => {
        const { queryClient, Wrapper } = makeWrapper()
        let status: AuthStatus = "authed"
        const me = createMeQuery<typeof ME | undefined>({
            scope: "me",
            queryFn: () => Promise.resolve(ME),
            useAuthStatus: () => status,
            userIdOf: (value) => value?.id,
        })

        const { rerender } = renderHook(() => me.useMe(), { wrapper: Wrapper })
        await waitFor(() => {
            expect(envelopeUserId()).toBe("u-1")
        })

        // 登出 = status 转 guest（enabled 转 false）+ removeQueries 清缓存，两条缺一都验不到信封清空
        // 别用「queryFn 返回 undefined」模拟登出——TanStack 当成查询失败、保留旧 data，测出来是假的绿
        status = "guest"
        queryClient.removeQueries({ queryKey: me.ME_QUERY_KEY })
        rerender()

        await waitFor(() => {
            expect(envelopeUserId()).toBeUndefined()
        })
    })

    it("不传 userIdOf 时不动信封：没要求就别塞值（监控仍工作，只是无法关联到人）", async () => {
        const { Wrapper } = makeWrapper()
        const me = createMeQuery<typeof ME | undefined>({
            scope: "me",
            queryFn: () => Promise.resolve(ME),
            useAuthStatus: (): AuthStatus => "authed",
        })

        const { result } = renderHook(() => me.useMe(), { wrapper: Wrapper })

        // 先确认 me 真的到了（否则「信封是空的」可能只是请求没发出去的假象）
        await waitFor(() => {
            expect(result.current.data).toEqual(ME)
        })
        expect(envelopeUserId()).toBeUndefined()
    })
})

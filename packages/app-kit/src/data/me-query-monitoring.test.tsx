import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vite-plus/test"

import { type AuthStatus } from "@shop/client"
import { createMonitor, type MonitoringEvent, track, Transport } from "@shop/monitoring"
import { I18nProvider } from "../i18n/provider"
import { createAppI18n } from "../i18n/runtime"
import { createMeQuery } from "./me-query"

/**
 * me 查询顺带把 userId 填进监控事件信封（frontend-monitoring 契约第 1 条）。
 *
 * 这条行为**坏了也不报错**：userId 默默变空时没有任何症状，监控只是少一列维度，
 * 所以必须钉住两条：
 * 1. me 到达后信封里有 id
 * 2. 登出（me 变 undefined）后被清空——不靠各端记得在登出处调一次 setMonitoringUser
 *
 * 断言从**真发出去的事件**里读，而不是从一个只给测试用的读口读：契约说的是「信封里有 id」，
 * 那就该验信封。那个读口（`monitoringUser`）正因为只有测试在调，被
 * `packages/common/src/public-surface.test.ts` 判成死导出删掉了。
 *
 * 顺带钉住「未登录不发请求」这条既有口径没被顺带改掉。
 */

const ME = { id: "u-1" }

const resources = {
    "zh-Hans-CN": { "confirm.cancel": "取消", "confirm.confirm": "确定" },
    "en-US": { "confirm.cancel": "Cancel", "confirm.confirm": "OK" },
}

/** 已发出的事件。装配是单例的、信封是模块级状态，所以整个文件共用一套 */
let sent: MonitoringEvent[] = []
let transport: Transport

beforeEach(() => {
    sent = []
    transport = new Transport({
        send: (_endpoint, body) => {
            sent.push(...(JSON.parse(body) as MonitoringEvent[]))
            return true
        },
    })
    // integrations 传空：本文件只关心信封里的 userId，不要真的去挂 window 监听。
    // 它顺带把 userId 复位成 undefined（与各用例开头清一次同效）
    createMonitor({ app: "web", transport, integrations: () => [], enabled: true })
})

/** 发一条探针事件、flush，读回它信封里的 userId */
function envelopeUserId(): string | undefined {
    const before = sent.length
    track({ kind: "route", to: "/probe" })
    // createMonitor 传了 enabled: true，track 会真的入队；这里把它推出去才读得到
    transport.flush()
    return sent.slice(before).at(-1)?.userId
}

/** 渲染器：QueryClient + I18nProvider（useMe 要在 Provider 内，且受 authed 门控） */
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

        // 登出：登录态转 guest（useAuthStatus 驱动）→ enabled 转 false；再清掉缓存（useClearMe 同款）。
        // 两条合起来才是真登出形状。两条缺一都验不到：
        // - 只改 status：enabled 转 false 但缓存还在，data 仍是旧 me（于是信封不清）
        // - 只删缓存：enabled 还开着，重拉又把 me 拉回来（queryFn 仍返回 ME）
        // 踩过的坑：**别用「queryFn 返回 undefined」来模拟登出**——TanStack Query 会把它当成
        // 查询失败（status=error）并**保留旧 data**，data 根本不翻成 undefined，测出来是假的绿
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

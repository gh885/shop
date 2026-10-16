import {
    QueryClientProvider,
    queryOptions,
    useQuery,
    useSuspenseQuery,
} from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vite-plus/test"

import { APP_KIT_MESSAGES, I18nProvider, createAppI18n } from "../i18n"
import { QueryBoundary } from "./query-boundary"
import { createAppQueryClient } from "./query-client"

/** 工厂的必填第一参是 Locale 持有者（§3.5）：本文件只测默认项，语言给什么都不影响断言 */
const newClient = () => createAppQueryClient(createAppI18n())

/** 钉 createAppQueryClient 的全局默认 throwOnError：必须用真实工厂建 client，裸 createTestQueryClient 不带应用默认值、测不出这套语义 */
/** 「抛」的判据是 data===undefined（有旧数据的后台刷新失败不抛，否则一屏内容被换成错误页）；suspense 收不到 options.throwOnError，降级决定写在降级调用点 */

const KEY = ["global-throw-on-error"] as const
const SUSPENSE_KEY = ["global-throw-on-error-suspense"] as const
const OPT_OUT_KEY = ["global-throw-on-error-opt-out"] as const

function OptOutProbe() {
    const { isError } = useQuery(
        queryOptions({
            queryKey: OPT_OUT_KEY,
            queryFn: async (): Promise<{ ok: boolean }> => {
                throw new Error("角标挂了")
            },
            retry: false,
            throwOnError: false,
        }),
    )
    return <span>isError:{String(isError)}</span>
}

/** 边界套 I18nProvider：QueryBoundary 取文案走 §7.3 链、需 locale，与生产装配同形；fallback 露错误文案 */
function renderInBoundary(client: ReturnType<typeof createAppQueryClient>, probe: React.ReactNode) {
    return render(
        <I18nProvider i18n={createAppI18n("zh-Hans-CN", APP_KIT_MESSAGES)}>
            <QueryClientProvider client={client}>
                <QueryBoundary
                    pending={<span>加载中</span>}
                    fallback={({ error }) => (
                        <span role="alert">
                            {error instanceof Error ? error.message : "未知错误"}
                        </span>
                    )}
                >
                    {probe}
                </QueryBoundary>
            </QueryClientProvider>
        </I18nProvider>,
    )
}

describe("createAppQueryClient 的全局 throwOnError", () => {
    it("默认（不写 throwOnError）把「无数据」的失败抛给边界，而不是让组件自己渲染 isError", async () => {
        function Probe() {
            const { data } = useQuery(
                queryOptions({
                    queryKey: KEY,
                    queryFn: async (): Promise<{ ok: boolean }> => {
                        throw new Error("店铺信息挂了")
                    },
                    retry: false,
                }),
            )
            return <span>data:{data ? "ok" : "none"}</span>
        }

        renderInBoundary(newClient(), <Probe />)

        expect(await screen.findByRole("alert")).toHaveTextContent("店铺信息挂了")
        expect(screen.queryByText(/^data:/)).not.toBeInTheDocument()
    })

    it("写 throwOnError: false 的查询就地失败：边界不接管，组件拿得到 isError", async () => {
        renderInBoundary(newClient(), <OptOutProbe />)

        expect(await screen.findByText("isError:true")).toBeInTheDocument()
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })

    it("有旧数据的后台刷新失败不抛：继续展示旧内容，不能把一屏能看的换成错误页", async () => {
        let calls = 0
        function Probe() {
            const { data, isError } = useQuery(
                queryOptions({
                    queryKey: ["global-throw-on-error-stale"],
                    queryFn: async (): Promise<{ n: number }> => {
                        calls++
                        if (calls > 1) throw new Error("刷新失败")
                        return { n: 1 }
                    },
                    retry: false,
                }),
            )
            return (
                <span>
                    data:{String(data?.n)} isError:{String(isError)} calls:{calls}
                </span>
            )
        }

        const client = newClient()
        renderInBoundary(client, <Probe />)
        expect(await screen.findByText("data:1 isError:false calls:1")).toBeInTheDocument()

        await act(async () => {
            await client.refetchQueries({ queryKey: ["global-throw-on-error-stale"] })
        })

        // 失败确实发生了（isError 翻真），但旧数据还在、边界没被触发
        expect(await screen.findByText("data:1 isError:true calls:2")).toBeInTheDocument()
        expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    })

    it("suspense 变体收不到 options 里的 throwOnError：传带 false 的 options 变量仍会抛给边界", async () => {
        function Probe() {
            const options = queryOptions({
                queryKey: SUSPENSE_KEY,
                queryFn: async (): Promise<{ ok: boolean }> => {
                    throw new Error("suspense 挂了")
                },
                retry: false,
            })
            // 传变量而非字面量：真实代码（orderDetailOptions）正是变量形态，内联会被官方 Omit 判成类型错、变量形态是静默失效，必须钉住
            const optedOut = { ...options, throwOnError: false }
            const { data } = useSuspenseQuery(optedOut)
            return <span>data:{String(data.ok)}</span>
        }

        renderInBoundary(newClient(), <Probe />)

        expect(await screen.findByRole("alert")).toHaveTextContent("suspense 挂了")
    })
})

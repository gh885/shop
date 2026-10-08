import { Suspense } from "react"

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import type { ShippingTemplateResponse, ShopResponse } from "@shop/api/sdk"
import { renderWithRouter } from "@shop/app-kit/test"
import { makeShippingRegionRule, makeShippingTemplate } from "@shop/test-utils/fixtures"
import { server } from "@shop/test-utils"

import { sellerMessages } from "#/locales"
import { ShopGate } from "#/shop"
import { tokenStore } from "#/shared/lib/api"

import { ShippingTemplatePage } from "./ShippingTemplatePage"

/**
 * 运费模板页的**落框接线**：`model.ts` 那条 schema 给出带 `path` 的结构化 issue，
 * `shippingServerFieldMap` 把服务端 422 的路径映射到表单字段——两边的键只在 TanStack 的
 * 字段表里对上，页面才会把红字显示在它自己那一格。
 *
 * 这两份东西单测都钉不住（单测只能证明「我算出来的键长这样」），而它们一旦对不上就是
 * **静默失效**：提交被拦住、页面一句红字都没有。所以这里走真实组件树 + MSW。
 *
 * 机制本身（方括号命名、没建 field 的格子会吞错）由 `packages/app-kit/src/i18n/nested-field-path.test.tsx`
 * 钉；本文件钉的是**这一页确实用对了**。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"

const SHOP = {
    id: SHOP_ID,
    ownerId: "00000000-0000-4000-8000-0000000000bb",
    name: "测试小店",
    logoKey: null,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    rejectReason: null,
} satisfies ShopResponse

/**
 * 两份地区规则 + 两个不配送省：数组下标要真的有第 2 格，否则「落在第几行」这件事测不出来。
 * wire 形状本身来自 `@shop/test-utils` 的那份夹具（`model.test.ts` 用同一份，共享判据见
 * `packages/common/src/shared-vocabulary.test.ts`），这里只加本店 id 与「够两行」的数量。
 */
function template(): ShippingTemplateResponse {
    return makeShippingTemplate({
        id: "00000000-0000-4000-8000-0000000000cc",
        shopId: SHOP_ID,
        regionRules: [
            makeShippingRegionRule({ regionPrefixes: ["440000"] }),
            makeShippingRegionRule({ regionPrefixes: ["310000"] }),
        ],
        excludedRegions: ["110000", "120000"],
    })
}

function renderPage() {
    // 复刻生产守卫装配（不再手搓 provider）：ShopGate 放行需两步——
    // ① 登录态：tokenStore.set 同步把 useAuthStatus 切成 authed，useMyShops 才 enabled；
    // ② 一家 ACTIVE 店：mock GET /shops，useCurrentShop 据此注入 ShopProvider。
    // 走的是 ShopGate 这个真·跨域入口，避免为测试往 shop 桶里塞仅测试用的 ShopProvider。
    tokenStore.set("test-token")
    server.use(http.get("*/shops/mine", () => HttpResponse.json([SHOP])))
    return renderWithRouter(
        <ShopGate>
            <Suspense fallback={null}>
                <ShippingTemplatePage />
            </Suspense>
        </ShopGate>,
        { resources: sellerMessages },
    )
}

/**
 * 同一标签的格子在 DOM 里按「默认运费 → 地区规则 1 → 地区规则 2」出现，取第 block 块里那个 `.TextField`
 * 所在的 `data-slot="field"` 容器——错误就渲染在同一个容器内，容器就是「落在哪一格」的证据。
 */
function fieldCell(label: string, block: number): Element {
    const inputs = screen.getAllByLabelText(label)
    const input = inputs[block]
    if (!input) throw new Error(`找不到第 ${block} 块的「${label}」`)
    const cell = input.closest("[data-slot='field']")
    if (!cell) throw new Error(`「${label}」那一格没有 Field 容器`)
    return cell
}

/** 页面用 `useSuspenseQuery` 取模板，所以每次渲染先挂 GET 再等它落地 */
async function renderLoadedPage() {
    renderPage()
    server.use(http.get("*/seller/shipping-template", () => HttpResponse.json(template())))
    await screen.findByRole("button", { name: "保存" })
}

describe("运费模板页：错误落进它自己那一格", () => {
    it("本地校验：第 2 条规则的续费填错，红字只在那一格，别处干净且不发请求", async () => {
        const user = userEvent.setup()
        let puts = 0
        await renderLoadedPage()
        server.use(
            http.put("*/seller/shipping-template", () => {
                puts += 1
                return HttpResponse.json(template())
            }),
        )

        const broken = screen.getAllByLabelText("续费（元）")[2]
        if (!broken) throw new Error("没有第 3 块续费格")
        await user.clear(broken)
        await user.type(broken, "abc")
        await user.click(screen.getByRole("button", { name: "保存" }))

        const message = "续费格式不正确，请输入不小于 0 的金额"
        await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1))
        expect(fieldCell("续费（元）", 2).textContent).toContain(message)
        // 同名的另外两格（默认运费、第 1 条规则）没被串上——这就是逐格建 field 换来的东西
        expect(fieldCell("续费（元）", 0).textContent).not.toContain(message)
        expect(fieldCell("续费（元）", 1).textContent).not.toContain(message)
        expect(puts).toBe(0)
    })

    it("服务端 422 的数组格路径（regionRules[0].firstFee.amount）落进第 1 条规则的「首费」", async () => {
        const user = userEvent.setup()
        await renderLoadedPage()
        server.use(
            http.put("*/seller/shipping-template", () =>
                HttpResponse.json(
                    {
                        status: 422,
                        detail: "输入校验失败（1 个字段错误）",
                        errors: [
                            {
                                field: "regionRules[0].firstFee.amount",
                                message: "首费不能低于成本价",
                                rule: "MIN",
                                min: 100,
                            },
                        ],
                    },
                    { status: 422 },
                ),
            ),
        )

        await user.click(screen.getByRole("button", { name: "保存" }))

        // 那句由前端 catalog 按 rule+min 出（「不能小于 100」），不是后端 message 那句中文
        const message = "不能小于 100"
        await screen.findByText(message)
        expect(fieldCell("首费（元）", 1).textContent).toContain(message)
        // 同名的另外两格（默认运费、第 2 条规则）没被串上：方括号那段确实按行分开落了
        expect(fieldCell("首费（元）", 0).textContent).not.toContain(message)
        expect(fieldCell("首费（元）", 2).textContent).not.toContain(message)
        expect(screen.queryByText("首费不能低于成本价")).not.toBeInTheDocument()
    })

    it("不配送地区的元素级 422（excludedRegions[1]）落进那一个选择器", async () => {
        const user = userEvent.setup()
        await renderLoadedPage()
        server.use(
            http.put("*/seller/shipping-template", () =>
                HttpResponse.json(
                    {
                        status: 422,
                        detail: "输入校验失败（1 个字段错误）",
                        errors: [
                            {
                                field: "excludedRegions[1]",
                                message: "区划码格式不正确",
                                rule: "PATTERN",
                            },
                        ],
                    },
                    { status: 422 },
                ),
            ),
        )

        await user.click(screen.getByRole("button", { name: "保存" }))

        const alert = await screen.findByText("格式不对")
        // 这一族只有一个选择器：元素级下标的错落回它，而不是页面底部一句话
        const card = alert.closest("[data-slot='card']")
        expect(card?.textContent).toContain("不配送地区")
        expect(screen.getAllByRole("alert")).toHaveLength(1)
    })
})

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
    // tokenStore.set 和 shops/mine 两步缺一不可：ShopGate 要登录态 + 一家 ACTIVE 店才会放行
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

// block 按 DOM 出现顺序（默认运费 → 规则 1 → 规则 2）取第 block 块：页面布局一重排这个下标会静默错位
function fieldCell(label: string, block: number): Element {
    const inputs = screen.getAllByLabelText(label)
    const input = inputs[block]
    if (!input) throw new Error(`找不到第 ${block} 块的「${label}」`)
    const cell = input.closest("[data-slot='field']")
    if (!cell) throw new Error(`「${label}」那一格没有 Field 容器`)
    return cell
}

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
        const card = alert.closest("[data-slot='card']")
        expect(card?.textContent).toContain("不配送地区")
        expect(screen.getAllByRole("alert")).toHaveLength(1)
    })
})

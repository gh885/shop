import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import type { ProductResponse } from "@shop/api/sdk"
import { renderWithRouter } from "@shop/app-kit/test"
import { makeProductResponse, server } from "@shop/test-utils"

import { useProductList, type ProductListSearch } from "./use-product-list"

/**
 * 商品列表这一屏的编排：筛选/排序/翻页都经 URL 走（可分享、刷新不丢），
 * 上下架与「编辑弹窗保存后」共用同一个失效入口。
 *
 * 钉住四条会静默变味的行为：改了筛选条件却留在第 3 页（用户看到的是一个莫名其妙 empties 的页）、
 * 下架成功但列表不重拉（按钮文案停在「上架中」）、点一个已经不在列表里的行，以及
 * 数据到手后才发现 URL 上的页码已经越界（列表收缩后停在空页上，看着像「没有商品」）。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"
const PRODUCT_ID = "00000000-0000-4000-8000-0000000000bb"
const CATEGORY_ID = "00000000-0000-4000-8000-0000000000cc"

function makeProduct(overrides: Partial<ProductResponse> = {}): ProductResponse {
    return makeProductResponse({
        id: PRODUCT_ID,
        shopId: SHOP_ID,
        categoryId: CATEGORY_ID,
        name: "降噪耳机",
        minPrice: { amount: 19900, currency: "CNY" },
        maxPrice: { amount: 19900, currency: "CNY" },
        stock: 10,
        soldCount: 2,
        status: "PUBLISHED",
        ...overrides,
    })
}

let listCalls = 0
let lastListUrl = ""

function useProductRoutes(
    offResponse: () => Response = () => HttpResponse.json(makeProduct()),
    /** 服务端返回的总条数：翻页/越界收口的断言要拿它算总页数 */
    total = 1,
) {
    listCalls = 0
    server.use(
        http.get("*/seller/products", ({ request }) => {
            listCalls += 1
            lastListUrl = request.url
            return HttpResponse.json({ records: [makeProduct()], total })
        }),
        http.post("*/seller/products/:id/off", () => offResponse()),
    )
}

function ProbeButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
        >
            {label}
        </button>
    )
}

function Probe({ search }: { search: ProductListSearch }) {
    const list = useProductList(SHOP_ID, search)
    return (
        <div>
            <span data-testid="total">{list.total}</span>
            <span data-testid="busy">{list.busyId ?? "-"}</span>
            <ProbeButton
                label="切到未发布"
                onClick={() => list.handleFilterChange({ status: "WAREHOUSE", title: "耳机" })}
            />
            <ProbeButton
                label="按库存升序"
                onClick={() => list.onSortChange("stock_asc")}
            />
            <ProbeButton
                label="翻到第 3 页"
                onClick={() => list.onPageChange(3)}
            />
            <ProbeButton
                label="下架"
                onClick={() => list.handleOff(PRODUCT_ID)}
            />
            <ProbeButton
                label="弹窗保存"
                onClick={() => list.handleSaved()}
            />
            <ProbeButton
                label="编辑不存在的行"
                onClick={() => list.handleEdit("not-in-list")}
            />
            <ProbeButton
                label="编辑这一行"
                onClick={() => list.handleEdit(PRODUCT_ID)}
            />
        </div>
    )
}

/**
 * 起点 search 直接作 prop 传进去：这里要验的是「一次操作把 URL 改成什么样」，
 * 每次点击后 hook 读到的仍是那一份输入，断言因此只有一处真相（router.state.location）。
 */
function createTestRouter(initialSearch: ProductListSearch) {
    const { router } = renderWithRouter(<Probe search={initialSearch} />, {
        initialEntry: "/product/list",
    })
    return { router, user: userEvent.setup() }
}

describe("useProductList 的筛选与翻页", () => {
    it("URL 没带状态时按「上架中」画页签：列表请求本身不带 status，缺省口径只在这一处定", async () => {
        useProductRoutes()
        createTestRouter({ page: 1, size: 10 })

        await screen.findByTestId("total")
        expect(lastListUrl).not.toContain("status=")
    })

    it("换页签回到第 1 页：停在第 3 页看一个新筛选，大概率是那页根本没有结果", async () => {
        useProductRoutes()
        const { router, user } = createTestRouter({ page: 3, size: 10 })
        await screen.findByTestId("total")

        await user.click(screen.getByRole("button", { name: "切到未发布" }))

        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({ status: "WAREHOUSE", page: 1 }),
        )
    })

    it("单纯翻页不动筛选：翻到第 3 页还是这批条件", async () => {
        useProductRoutes()
        const { router, user } = createTestRouter({ page: 1, size: 10, status: "WAREHOUSE" })
        await screen.findByTestId("total")

        await user.click(screen.getByRole("button", { name: "翻到第 3 页" }))

        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({ page: 3, status: "WAREHOUSE" }),
        )
    })

    it("换排序也回到第 1 页：第 3 页的「按库存升序」不是用户想的那一批", async () => {
        useProductRoutes()
        const { router, user } = createTestRouter({ page: 4, size: 10 })
        await screen.findByTestId("total")

        await user.click(screen.getByRole("button", { name: "按库存升序" }))

        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({ sort: "stock_asc", page: 1 }),
        )
    })

    it("数据到手后发现页码越界，退回最后一页：下架/换筛选让列表收缩后的收口", async () => {
        // 11 条 / 每页 10 条 = 只有 2 页，URL 上那个 page=3 已经不存在了
        useProductRoutes(undefined, 11)
        const { router } = createTestRouter({ page: 3, size: 10 })
        await screen.findByTestId("total")

        await waitFor(() => expect(router.state.location.search).toMatchObject({ page: 2 }))
    })
})

describe("useProductList 的行内动作", () => {
    const FIRST_PAGE = { page: 1, size: 10 }

    it("下架成功后本店列表重拉一次：不重拉的话这一行还写着「上架中」", async () => {
        useProductRoutes()
        const { user } = createTestRouter(FIRST_PAGE)
        await screen.findByTestId("total")
        expect(listCalls).toBe(1)

        await user.click(screen.getByRole("button", { name: "下架" }))

        await waitFor(() => expect(listCalls).toBe(2))
        await waitFor(() => expect(screen.getByTestId("busy")).toHaveTextContent("-"))
    })

    it("下架失败不再拉列表：数据没变，重拉只会把这一屏盖成另一份快照", async () => {
        useProductRoutes(
            () =>
                new Response(JSON.stringify({ status: 500, detail: "下架失败" }), {
                    status: 500,
                }),
        )
        const { user } = createTestRouter(FIRST_PAGE)
        await screen.findByTestId("total")

        await user.click(screen.getByRole("button", { name: "下架" }))

        await waitFor(() => expect(screen.getByTestId("busy")).toHaveTextContent("-"))
        expect(listCalls).toBe(1)
    })

    it("列表内编辑弹窗保存后同样重拉本店列表：与上下架走的是同一个 key", async () => {
        useProductRoutes()
        const { user } = createTestRouter(FIRST_PAGE)
        await screen.findByTestId("total")

        await user.click(screen.getByRole("button", { name: "弹窗保存" }))

        await waitFor(() => expect(listCalls).toBe(2))
    })

    it("编辑：行还在列表里就带着它的类目跳过去，行已经不在了就什么都不做", async () => {
        useProductRoutes()
        const { router, user } = createTestRouter(FIRST_PAGE)
        await screen.findByTestId("total")

        await user.click(screen.getByRole("button", { name: "编辑不存在的行" }))
        expect(router.state.location.pathname).toBe("/product/list")

        await user.click(screen.getByRole("button", { name: "编辑这一行" }))
        await waitFor(() => expect(router.state.location.pathname).toBe("/product/create/basic"))
    })
})

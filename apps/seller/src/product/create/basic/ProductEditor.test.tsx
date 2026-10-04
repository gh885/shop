import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"
import type { SkuResponse } from "@shop/api/sdk"
import { money } from "@shop/common/domain"
import { apiProblem, makeProductResponse, server } from "@shop/test-utils"
import { QueryBoundary } from "@shop/app-kit/data"
import { renderWithRouter } from "@shop/app-kit/test"
import { sellerMessages } from "#/locales"
import { ProductEditor } from "#/product"

const SHOP = "00000000-0000-4000-8000-0000000000a1"
const CATEGORY = "00000000-0000-4000-8000-0000000000b1"
const PRODUCT = "00000000-0000-4000-8000-0000000000c1"
const product = makeProductResponse({
    id: PRODUCT,
    shopId: SHOP,
    categoryId: CATEGORY,
    name: "原商品标题",
    status: "DRAFT",
    specs: [],
    images: ["img/main.jpg"],
})
const sku: SkuResponse = {
    id: "00000000-0000-4000-8000-0000000000d1",
    productId: PRODUCT,
    name: "单规格",
    skuCode: null,
    attributes: [],
    image: null,
    price: money(1000),
    originalPrice: null,
    stock: 5,
    status: "ON_SALE",
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
}

function stubApi({
    detail,
    save,
}: {
    detail?: () => Promise<Response> | Response
    save?: () => Promise<Response> | Response
} = {}) {
    const calls = { detail: 0, create: 0, save: 0, skus: 0 }
    server.use(
        http.get("*/api/categories/tree", () => HttpResponse.json([])),
        http.get("*/api/categories/:id/attr-template", () => HttpResponse.json([])),
        http.get("*/seller/products/:id", () => {
            calls.detail += 1
            return detail ? detail() : HttpResponse.json({ product, skus: [sku] })
        }),
        http.post("*/seller/products", () => {
            calls.create += 1
            return HttpResponse.json(product, { status: 201 })
        }),
        http.put("*/seller/products/:id", () => {
            calls.save += 1
            return save ? save() : HttpResponse.json(product)
        }),
        http.put("*/seller/products/:id/specs", () => HttpResponse.json([sku])),
        http.put("*/seller/products/:id/skus", () => {
            calls.skus += 1
            return HttpResponse.json([sku])
        }),
    )
    return calls
}

const EXISTING_PRODUCT = { productId: PRODUCT }

function renderEditor({ productId }: { productId?: string } = EXISTING_PRODUCT) {
    const onCreated = vi.fn<(id: string) => void>()
    const onFinished = vi.fn<() => void>()
    const view = renderWithRouter(
        <EditorHarness
            productId={productId}
            onCreated={onCreated}
            onFinished={onFinished}
        />,
        { resources: sellerMessages },
    )
    return { ...view, onCreated, onFinished }
}

/** 模拟路由收到建档 ID 后回写 search；业务模块本身不被 mock。 */
function EditorHarness({
    productId,
    onCreated,
    onFinished,
}: {
    productId: string | undefined
    onCreated: (id: string) => void
    onFinished: () => void
}) {
    const [id, setId] = useState(productId)
    return (
        <>
            <QueryBoundary fallback="读取商品失败">
                <ProductEditor
                    shopId={SHOP}
                    categoryId={CATEGORY}
                    productId={id}
                    onCreated={(created) => {
                        setId(created)
                        onCreated(created)
                    }}
                    onFinished={onFinished}
                    onSwitchCategory={() => undefined}
                />
            </QueryBoundary>
            <Link
                to="/product/list"
                search={{ page: 1, size: 10 }}
            >
                离开编辑器
            </Link>
            <button
                type="button"
                onClick={() => setId("00000000-0000-4000-8000-0000000000c2")}
            >
                切换商品
            </button>
        </>
    )
}

type TestUser = ReturnType<typeof userEvent.setup>
type TestRouter = ReturnType<typeof renderWithRouter>["router"]

async function expectBlocked(user: TestUser, router: TestRouter) {
    await user.click(screen.getByRole("link", { name: "离开编辑器" }))
    await user.click(await screen.findByRole("button", { name: "继续编辑" }))
    expect(router.state.location.pathname).toBe("/")
}

async function expectCanLeave(user: TestUser, router: TestRouter) {
    await user.click(screen.getByRole("link", { name: "离开编辑器" }))
    await waitFor(() => expect(router.state.location.pathname).toBe("/product/list"))
    await act(async () => {
        await router.navigate({ to: "/" })
    })
}

function deferredResponse() {
    let resolve: (response: Response) => void = vi.fn<(response: Response) => void>()
    const promise = new Promise<Response>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

const titleInput = () => screen.findByRole("textbox", { name: /商品标题/ })

describe("ProductEditor 完整编辑会话", () => {
    it("编辑回填不算修改；只改 SKU 也要确认离开，取消后值还在", async () => {
        stubApi()
        const user = userEvent.setup()
        const { router } = renderEditor()
        expect(await titleInput()).toHaveValue("原商品标题")
        await expectCanLeave(user, router)
        const price = within(await screen.findByRole("table")).getByPlaceholderText("0.00")
        await user.clear(price)
        await user.type(price, "25")
        await user.tab()
        await expectBlocked(user, router)
        await user.click(screen.getByRole("link", { name: "离开编辑器" }))
        await user.click(await screen.findByRole("button", { name: "继续编辑" }))
        expect(router.state.location.pathname).toBe("/")
        expect(price).toHaveValue("25.00")
    })

    it("保存成功清除未保存标记，之后的第一个字符仍算新修改", async () => {
        const calls = stubApi()
        const user = userEvent.setup()
        const { router } = renderEditor()
        const title = await titleInput()
        await user.type(title, "甲")
        await expectBlocked(user, router)
        await user.click(screen.getByRole("button", { name: "保存草稿" }))
        await waitFor(() => expect(calls.skus).toBe(1))
        await expectCanLeave(user, router)
        await user.type(title, "乙")
        await expectBlocked(user, router)
    })

    it("保存失败保留编辑值与离页保护，422 仍落回字段", async () => {
        stubApi({
            save: () =>
                HttpResponse.json(
                    apiProblem(422, {
                        detail: "标题不合法",
                        errors: [{ field: "name", message: "标题不能这样写" }],
                    }),
                    { status: 422 },
                ),
        })
        const user = userEvent.setup()
        const { router } = renderEditor()
        const title = await titleInput()
        await user.type(title, "甲")
        await user.click(screen.getByRole("button", { name: "保存草稿" }))
        expect(await screen.findByText("标题不能这样写")).toBeInTheDocument()
        expect(title).toHaveValue("原商品标题甲")
        await expectBlocked(user, router)
    })

    it("等待保存时继续输入，旧请求成功也不能把新编辑标成已保存", async () => {
        const pending = deferredResponse()
        const calls = stubApi({ save: () => pending.promise })
        const user = userEvent.setup()
        const { router } = renderEditor()
        const title = await titleInput()
        await user.type(title, "甲")
        await user.click(screen.getByRole("button", { name: "保存草稿" }))
        await waitFor(() => expect(calls.save).toBe(1))
        await user.type(title, "乙")
        await act(async () => pending.resolve(HttpResponse.json(product)))
        await waitFor(() => expect(calls.skus).toBe(1))
        await waitFor(() => expect(screen.getByRole("button", { name: "保存草稿" })).toBeEnabled())
        await expectBlocked(user, router)
        expect(title).toHaveValue("原商品标题甲乙")
    })

    it.each([403, 500])("详情未到或失败（%i）时不挂可保存的空表单", async (status) => {
        const pending = deferredResponse()
        const calls = stubApi({ detail: () => pending.promise })
        renderEditor()
        await waitFor(() => expect(calls.detail).toBe(1))
        expect(screen.queryByRole("button", { name: "保存草稿" })).not.toBeInTheDocument()
        await act(async () =>
            pending.resolve(
                HttpResponse.json(apiProblem(status, { detail: "不可编辑" }), { status }),
            ),
        )
        expect(await screen.findByRole("button", { name: "重试" })).toBeInTheDocument()
        expect(screen.queryByRole("textbox", { name: /商品标题/ })).not.toBeInTheDocument()
        expect(calls.save).toBe(0)
    })

    it("新建会话输入不建档，显式保存才通知新 ID", async () => {
        const calls = stubApi()
        const user = userEvent.setup()
        const { onCreated, router } = renderEditor({})
        expect(await titleInput()).toBeInTheDocument()
        expect(calls.create).toBe(0)
        await user.type(await titleInput(), "甲")
        expect(onCreated).not.toHaveBeenCalled()
        await user.click(screen.getByRole("button", { name: "保存草稿" }))
        await waitFor(() => expect(onCreated).toHaveBeenCalledWith(PRODUCT))
        await expectCanLeave(user, router)
        expect(calls.create).toBe(1)
        expect(calls.detail).toBe(0)
        expect(await titleInput()).toHaveValue("甲")
    })
    it("切换到另一商品会重新回填，不继承上一份草稿与写入 ID", async () => {
        const calls = stubApi()
        const user = userEvent.setup()
        renderEditor()
        await user.type(await titleInput(), "甲")
        await user.click(screen.getByRole("button", { name: "切换商品" }))
        await waitFor(() => expect(calls.detail).toBe(2))
        expect(await titleInput()).toHaveValue("原商品标题")
    })
})

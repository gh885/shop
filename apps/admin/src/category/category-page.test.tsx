import type {
    CategoryAttrNodeResponse,
    CategoryAttrResponse,
    CategoryResponse,
} from "@shop/api/sdk"
import { renderWithProviders } from "@shop/app-kit/test"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { makeCategoryNode, server } from "@shop/test-utils"
import { adminMessages } from "#/locales"
import { CategoryPage } from "./page"

const TEE_ID = "00000000-0000-4000-8000-000000000003"
const TOP_ID = "00000000-0000-4000-8000-000000000002"
const CLOTHES_ID = "00000000-0000-4000-8000-000000000001"

const tee = makeCategoryNode({
    id: TEE_ID,
    name: "T恤",
    level: 3,
    sort: 10,
    parentId: TOP_ID,
    status: "DISABLED",
})
const top = makeCategoryNode({
    id: TOP_ID,
    name: "上装",
    level: 2,
    sort: 10,
    parentId: CLOTHES_ID,
    children: [tee],
})
const pants = makeCategoryNode({
    id: "00000000-0000-4000-8000-000000000004",
    name: "下装",
    level: 2,
    sort: 20,
    parentId: CLOTHES_ID,
})
const clothes = makeCategoryNode({
    id: CLOTHES_ID,
    name: "服装",
    sort: 10,
    children: [top, pants],
})

const childFixture: CategoryResponse = {
    id: "00000000-0000-4000-8000-00000000000a",
    parentId: CLOTHES_ID,
    name: "配饰",
    level: 2,
    sort: 30,
    status: "ENABLED",
    iconUrl: null,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
}

const attrFixture: CategoryAttrResponse = {
    id: "00000000-0000-4000-8000-00000000000b",
    categoryId: TEE_ID,
    name: "颜色",
    kind: "SPEC",
    required: false,
    allowCustom: true,
    allowImage: false,
    sort: 0,
    status: "ENABLED",
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
}

const attrNodes: CategoryAttrNodeResponse[] = [{ attr: attrFixture, values: [] }]

function useCategoryRoutes() {
    const calls = {
        created: [] as unknown[],
        sorts: [] as { id: string; sort: number | undefined }[],
        attrs: [] as unknown[],
        values: [] as unknown[],
        status: 0,
    }
    server.use(
        http.get("*/admin/categories/tree", () => HttpResponse.json([clothes])),
        http.get("*/admin/categories/:id/attrs", () => HttpResponse.json(attrNodes)),
        http.post("*/admin/categories", async ({ request }) => {
            calls.created.push(await request.json())
            return HttpResponse.json(childFixture)
        }),
        http.put("*/admin/categories/:id", async ({ request, params }) => {
            const body: unknown = await request.json()
            const sort = body && typeof body === "object" ? Reflect.get(body, "sort") : undefined
            calls.sorts.push({
                id: String(params.id),
                sort: typeof sort === "number" ? sort : undefined,
            })
            return HttpResponse.json(childFixture)
        }),
        http.put("*/admin/categories/:id/status", () => {
            calls.status += 1
            return new HttpResponse(null, { status: 200 })
        }),
        http.post("*/admin/categories/:id/attrs", async ({ request }) => {
            calls.attrs.push(await request.json())
            return HttpResponse.json(attrFixture)
        }),
        http.post("*/category-attrs/:attrId/values", async ({ request, params }) => {
            const body: unknown = await request.json()
            calls.values.push(body)
            const value = body && typeof body === "object" ? Reflect.get(body, "value") : undefined
            return HttpResponse.json(
                {
                    id: "00000000-0000-4000-8000-00000000000c",
                    attrId: String(params.attrId),
                    value: typeof value === "string" ? value : "XL",
                    sort: 0,
                    source: "PLATFORM",
                    image: null,
                    createdAt: "2026-09-01T10:00:00Z",
                },
                { status: 201 },
            )
        }),
    )
    return calls
}

function formOf(buttonName: string): HTMLElement {
    const form = screen.getByRole("button", { name: buttonName }).closest("form")
    if (!(form instanceof HTMLElement)) throw new Error(`找不到「${buttonName}」所在的表单`)
    return form
}

async function renderToLeaf() {
    renderWithProviders(<CategoryPage />, { resources: adminMessages })
    const user = userEvent.setup()

    await user.click(await screen.findByRole("treeitem", { name: "服装" }))
    await user.click(await screen.findByRole("treeitem", { name: "上装" }))
    await screen.findByRole("treeitem", { name: "T恤" })

    return user
}

describe("CategoryPage", () => {
    it("树按层级渲染，禁用节点也在（管理端口径含禁用）", async () => {
        useCategoryRoutes()
        renderWithProviders(<CategoryPage />, { resources: adminMessages })
        const user = userEvent.setup()

        expect(await screen.findByRole("treeitem", { name: "服装" })).toBeInTheDocument()
        expect(screen.queryByRole("treeitem", { name: "上装" })).toBeNull()

        await user.click(screen.getByRole("treeitem", { name: "服装" }))
        expect(await screen.findByRole("treeitem", { name: "上装" })).toBeInTheDocument()

        await user.click(screen.getByRole("treeitem", { name: "上装" }))
        expect(await screen.findByRole("treeitem", { name: "T恤" })).toBeInTheDocument()
        expect(screen.getByText("已禁用")).toBeInTheDocument()
    })

    it("三级类目才出属性模板", async () => {
        useCategoryRoutes()
        const user = await renderToLeaf()

        expect(screen.queryByText("属性模板")).toBeNull()

        await user.click(screen.getByRole("treeitem", { name: "T恤" }))

        expect(await screen.findByText("属性模板")).toBeInTheDocument()
        expect(await screen.findByText("颜色")).toBeInTheDocument()
    })

    it("新建子类目带上父 id 与末尾 sort", async () => {
        const calls = useCategoryRoutes()
        renderWithProviders(<CategoryPage />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(await screen.findByRole("treeitem", { name: "服装" }))
        await user.click(screen.getByRole("button", { name: "新建子类目" }))

        await user.type(within(formOf("创建")).getByRole("textbox", { name: "类目名称" }), "配饰")
        await user.click(screen.getByRole("button", { name: "创建" }))

        await waitFor(() => expect(calls.created).toHaveLength(1))
        expect(calls.created[0]).toMatchObject({ parentId: CLOTHES_ID, name: "配饰", sort: 30 })
    })

    it("同级上移：一次提交两行的 sort", async () => {
        const calls = useCategoryRoutes()
        renderWithProviders(<CategoryPage />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(await screen.findByRole("treeitem", { name: "服装" }))
        await user.click(await screen.findByRole("treeitem", { name: "下装" }))
        await user.click(screen.getByRole("button", { name: "同级上移" }))

        await waitFor(() => expect(calls.sorts).toHaveLength(2))
        expect(calls.sorts).toContainEqual({ id: pants.id, sort: 10 })
        expect(calls.sorts).toContainEqual({ id: top.id, sort: 20 })
    })

    it("禁用是危险操作：先二次确认，不确认就不发请求", async () => {
        const calls = useCategoryRoutes()
        renderWithProviders(<CategoryPage />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(await screen.findByRole("treeitem", { name: "服装" }))
        await user.click(screen.getByRole("button", { name: "禁用" }))

        expect(await screen.findByText("禁用「服装」？")).toBeInTheDocument()
        expect(calls.status).toBe(0)

        await user.click(screen.getByRole("button", { name: "禁用" }))
        await waitFor(() => expect(calls.status).toBe(1))
    })

    it("新增属性按类型提交，并可给属性加值", async () => {
        const calls = useCategoryRoutes()
        const user = await renderToLeaf()

        await user.click(screen.getByRole("treeitem", { name: "T恤" }))
        await screen.findByText("属性模板")

        await user.click(screen.getByRole("button", { name: "新增属性" }))
        await user.type(screen.getByLabelText(/属性名称/), "尺码")
        await user.click(screen.getByRole("button", { name: "新增" }))

        await waitFor(() => expect(calls.attrs).toHaveLength(1))
        expect(calls.attrs[0]).toMatchObject({ name: "尺码", kind: "SPEC", required: false })

        await user.click(screen.getByRole("button", { name: "添加值" }))
        await user.type(within(formOf("添加")).getByRole("textbox", { name: "取值" }), "XL")
        await user.click(screen.getByRole("button", { name: "添加" }))

        await waitFor(() => expect(calls.values).toHaveLength(1))
        expect(calls.values[0]).toMatchObject({ value: "XL" })
    })
})

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
    code: "tee",
    level: 3,
    sort: 10,
    parentId: TOP_ID,
    status: "DISABLED",
})
const top = makeCategoryNode({
    id: TOP_ID,
    name: "上装",
    code: "top",
    level: 2,
    sort: 10,
    parentId: CLOTHES_ID,
    children: [tee],
})
const pants = makeCategoryNode({
    id: "00000000-0000-4000-8000-000000000004",
    name: "下装",
    code: "pants",
    level: 2,
    sort: 20,
    parentId: CLOTHES_ID,
})
const clothes = makeCategoryNode({
    id: CLOTHES_ID,
    name: "服装",
    code: "clothes",
    sort: 10,
    children: [top, pants],
})

const configFixture = {
    categoryId: TEE_ID,
    identityKeys: ["color"],
    skuIdentityKinds: ["color"],
    matchStrategies: ["STANDARD_SPU"],
    brandPolicy: "OPTIONAL",
    qualificationCodes: [],
    autoApprove: false,
    attributes: [
        {
            id: "00000000-0000-4000-8000-00000000000b",
            code: "color",
            name: "颜色",
            valueType: "ENUM",
            unit: "",
            options: ["红色", "蓝色"],
            values: [
                {
                    id: "00000000-0000-4000-8000-0000000000c1",
                    value: "红色",
                    imageUrl: "",
                    sort: 10,
                    source: "PLATFORM",
                    status: "active",
                },
                {
                    id: "00000000-0000-4000-8000-0000000000c2",
                    value: "蓝色",
                    imageUrl: "",
                    sort: 20,
                    source: "PLATFORM",
                    status: "active",
                },
            ],
            allowCustom: false,
            salesSpec: true,
            required: true,
            identity: true,
            filterable: true,
            multi: false,
            status: "active",
            sort: 10,
            visibleWhen: null,
        },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
}

function useCategoryRoutes() {
    const calls = {
        created: [] as unknown[],
        sorts: [] as { categoryId: string; sort: number | undefined }[],
        status: 0,
    }
    server.use(
        http.get("*/admin/categories/tree", () => HttpResponse.json([clothes])),
        http.get("*/admin/categories/:categoryId/config", () => HttpResponse.json(configFixture)),
        http.post("*/admin/categories", async ({ request }) => {
            calls.created.push(await request.json())
            return HttpResponse.json({ categoryId: "00000000-0000-4000-8000-00000000000a" })
        }),
        http.put("*/admin/categories/:categoryId/sort", async ({ request, params }) => {
            const body: unknown = await request.json()
            const sort = body && typeof body === "object" ? Reflect.get(body, "sort") : undefined
            calls.sorts.push({
                categoryId: String(params.categoryId),
                sort: typeof sort === "number" ? sort : undefined,
            })
            return new HttpResponse(null, { status: 200 })
        }),
        http.put("*/admin/categories/:categoryId/status", () => {
            calls.status += 1
            return new HttpResponse(null, { status: 200 })
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

    it("三级类目才出属性面板，属性照 config 接口的 attributes 展示", async () => {
        useCategoryRoutes()
        const user = await renderToLeaf()

        expect(screen.queryByText("属性模板")).toBeNull()

        await user.click(screen.getByRole("treeitem", { name: "T恤" }))

        expect(await screen.findByText("属性模板")).toBeInTheDocument()
        expect(await screen.findByText("颜色")).toBeInTheDocument()
        // 面板是只读展示：名称之外还印 code 与值类型
        expect(screen.getByText("color")).toBeInTheDocument()
        expect(screen.getByText("ENUM")).toBeInTheDocument()
    })

    it("新建子类目带上父 id、code 与末尾 sort", async () => {
        const calls = useCategoryRoutes()
        renderWithProviders(<CategoryPage />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(await screen.findByRole("treeitem", { name: "服装" }))
        await user.click(screen.getByRole("button", { name: "新建子类目" }))

        const form = formOf("创建")
        await user.type(within(form).getByRole("textbox", { name: "类目名称" }), "配饰")
        await user.type(within(form).getByRole("textbox", { name: "编码" }), "accessory")
        await user.click(screen.getByRole("button", { name: "创建" }))

        await waitFor(() => expect(calls.created).toHaveLength(1))
        expect(calls.created[0]).toMatchObject({
            parentId: CLOTHES_ID,
            code: "accessory",
            name: "配饰",
            sort: 30,
        })
    })

    it("同级上移：一次提交两行的 sort", async () => {
        const calls = useCategoryRoutes()
        renderWithProviders(<CategoryPage />, { resources: adminMessages })
        const user = userEvent.setup()

        await user.click(await screen.findByRole("treeitem", { name: "服装" }))
        await user.click(await screen.findByRole("treeitem", { name: "下装" }))
        await user.click(screen.getByRole("button", { name: "同级上移" }))

        await waitFor(() => expect(calls.sorts).toHaveLength(2))
        expect(calls.sorts).toContainEqual({ categoryId: pants.id, sort: 10 })
        expect(calls.sorts).toContainEqual({ categoryId: top.id, sort: 20 })
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
})

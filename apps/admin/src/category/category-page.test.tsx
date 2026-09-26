import type {
    CategoryAttrNodeResponse,
    CategoryAttrResponse,
    CategoryNode,
    CategoryResponse,
} from "@shop/api/sdk"
import { renderWithProviders } from "@shop/app-kit/test"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vitest"

import { server } from "@shop/test-utils"
import { CategoryPage } from "./page"

/**
 * 类目运维页的接线。钉四件事：
 *  1) 树按层级渲染、点选才展开，禁用节点也在（管理端口径含禁用，与买家侧「禁用整支剪掉」相反）；
 *  2) 选中三级类目才出属性模板——属性只能挂叶子，非叶子显示了等于骗人；
 *  3) 新建子类目带上父 id 与末尾 sort（顺序由 sort 决定，不带就会掉到最前）；
 *  4) 同级上移一次提交两行 sort；禁用要过二次确认。
 *
 * 树项的 role 是 `treeitem`（headless-tree 在 button 上挂了显式 role，可访问名由 aria-label 给）。
 */
const ROOT_PARENT = "00000000-0000-0000-0000-000000000000"

function node(
    id: string,
    name: string,
    level: number,
    sort: number,
    children: CategoryNode[] = [],
    parentId = ROOT_PARENT,
): CategoryNode {
    return { id, parentId, name, level, sort, status: "ENABLED", iconUrl: null, children }
}

const TEE_ID = "00000000-0000-4000-8000-000000000003"
const TOP_ID = "00000000-0000-4000-8000-000000000002"
const CLOTHES_ID = "00000000-0000-4000-8000-000000000001"

const tee = { ...node(TEE_ID, "T恤", 3, 10, [], TOP_ID), status: "DISABLED" as const }
const top = node(TOP_ID, "上装", 2, 10, [tee], CLOTHES_ID)
const pants = node("00000000-0000-4000-8000-000000000004", "下装", 2, 20, [], CLOTHES_ID)
const clothes = node(CLOTHES_ID, "服装", 1, 10, [top, pants])

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

/** 每轮现造路由，并把请求体记下来——断言的是「发出去的形状」 */
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
            // 契约响应要逐字段过 zod，所以这里回一个完整的值域条目（空对象会被判契约不符）
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

/** 页面上有多个同名标签（编辑表单与新建表单），按「按钮所在的表单」框定范围 */
function formOf(buttonName: string): HTMLElement {
    const form = screen.getByRole("button", { name: buttonName }).closest("form")
    if (!(form instanceof HTMLElement)) throw new Error(`找不到「${buttonName}」所在的表单`)
    return form
}

/** 渲染并展开到三级类目（树是整页的原料，等它出来再操作） */
async function renderToLeaf() {
    renderWithProviders(<CategoryPage />)
    const user = userEvent.setup()

    await user.click(await screen.findByRole("treeitem", { name: "服装" }))
    await user.click(await screen.findByRole("treeitem", { name: "上装" }))
    await screen.findByRole("treeitem", { name: "T恤" })

    return user
}

describe("CategoryPage", () => {
    it("树按层级渲染，禁用节点也在（管理端口径含禁用）", async () => {
        useCategoryRoutes()
        renderWithProviders(<CategoryPage />)
        const user = userEvent.setup()

        // 未展开时只有一级
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

        // 选中三级类目之前，属性模板不该出现（属性只能挂叶子）
        expect(screen.queryByText("属性模板")).toBeNull()

        await user.click(screen.getByRole("treeitem", { name: "T恤" }))

        expect(await screen.findByText("属性模板")).toBeInTheDocument()
        expect(await screen.findByText("颜色")).toBeInTheDocument()
    })

    it("新建子类目带上父 id 与末尾 sort", async () => {
        const calls = useCategoryRoutes()
        renderWithProviders(<CategoryPage />)
        const user = userEvent.setup()

        await user.click(await screen.findByRole("treeitem", { name: "服装" }))
        await user.click(screen.getByRole("button", { name: "新建子类目" }))

        // 右栏的编辑表单也叫「类目名称」，所以按所在的表单框定
        await user.type(within(formOf("创建")).getByRole("textbox", { name: "类目名称" }), "配饰")
        await user.click(screen.getByRole("button", { name: "创建" }))

        await waitFor(() => expect(calls.created).toHaveLength(1))
        // 服装下同级已有两个（上装 10、下装 20），新节点排 30
        expect(calls.created[0]).toMatchObject({ parentId: CLOTHES_ID, name: "配饰", sort: 30 })
    })

    it("同级上移：一次提交两行的 sort", async () => {
        const calls = useCategoryRoutes()
        renderWithProviders(<CategoryPage />)
        const user = userEvent.setup()

        await user.click(await screen.findByRole("treeitem", { name: "服装" }))
        await user.click(await screen.findByRole("treeitem", { name: "下装" }))
        await user.click(screen.getByRole("button", { name: "同级上移" }))

        await waitFor(() => expect(calls.sorts).toHaveLength(2))
        // 下装挪到第一格 → 10；上装被挤到第二格 → 20
        expect(calls.sorts).toContainEqual({ id: pants.id, sort: 10 })
        expect(calls.sorts).toContainEqual({ id: top.id, sort: 20 })
    })

    it("禁用是危险操作：先二次确认，不确认就不发请求", async () => {
        const calls = useCategoryRoutes()
        renderWithProviders(<CategoryPage />)
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
        // 「取值」与「取值配图 URL」两个标签同前缀，按所在的表单框定
        await user.type(within(formOf("添加")).getByRole("textbox", { name: "取值" }), "XL")
        await user.click(screen.getByRole("button", { name: "添加" }))

        await waitFor(() => expect(calls.values).toHaveLength(1))
        expect(calls.values[0]).toMatchObject({ value: "XL" })
    })
})

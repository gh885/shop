import { act, renderHook, waitFor } from "@testing-library/react"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vite-plus/test"

import type { ProductResponse, SkuResponse } from "@shop/api/sdk"
import { money } from "@shop/common/domain"
import { apiProblem, makeCategoryAttrNode, makeProductResponse, server } from "@shop/test-utils"

import { createAppTestHookClient } from "@shop/app-kit/test"

import type { ProductBasicForm } from "#/domains/product/draft-rules"
import { categorySpecTemplateOptions, productKeys } from "#/domains/product/queries"

import { useProductDraft } from "./use-product-draft"

// 只管 hook 接线「何时发哪个请求」：纯函数由 draft-rules/edit-rules 测试钉；新建态编辑必须零写库，只有保存/提交才落库。

const SHOP_ID = "00000000-0000-4000-8000-0000000000a1"
const CATEGORY_ID = "00000000-0000-4000-8000-0000000000b1"
const PRODUCT_ID = "00000000-0000-4000-8000-0000000000c1"
const COLOR_ATTR_ID = "00000000-0000-4000-8000-0000000000d1"
const BLACK_ID = "00000000-0000-4000-8000-0000000000d2"
const WHITE_ID = "00000000-0000-4000-8000-0000000000d3"
const SKU_BLACK = "00000000-0000-4000-8000-0000000000e1"
const SKU_WHITE = "00000000-0000-4000-8000-0000000000e2"

const NOW = "2026-09-01T00:00:00Z"

const COLOR_TEMPLATE = makeCategoryAttrNode({ id: COLOR_ATTR_ID, categoryId: CATEGORY_ID }, [
    { id: BLACK_ID, value: "黑色" },
    { id: WHITE_ID, value: "白色" },
])

function makeSku(
    id: string,
    valueId: string,
    value: string,
    price: number | null = null,
): SkuResponse {
    // 单规格的 attributes 也给齐：rowFromSku 按属性拼 label，空数组是另一种行
    return {
        id,
        productId: PRODUCT_ID,
        skuCode: null,
        name: value,
        attributes: [{ attrId: COLOR_ATTR_ID, valueId, name: "颜色", value }],
        image: null,
        price: price === null ? null : money(price),
        originalPrice: null,
        stock: 0,
        status: "ON_SALE",
        createdAt: NOW,
        updatedAt: NOW,
    }
}

function makeProduct(overrides: Partial<ProductResponse> = {}): ProductResponse {
    return makeProductResponse({
        id: PRODUCT_ID,
        shopId: SHOP_ID,
        categoryId: CATEGORY_ID,
        name: "服务端商品名",
        specs: [
            {
                attrId: COLOR_ATTR_ID,
                name: "颜色",
                values: [{ valueId: BLACK_ID, value: "黑色", image: null }],
            },
        ],
        ...overrides,
    })
}

const BASIC: ProductBasicForm = {
    name: "新耳机",
    subtitle: "",
    images: ["img/main.jpg"],
    detailImages: [],
    sevenDayReturn: true,
}

interface ApiCalls {
    detail: number
    create: number
    basic: number
    specs: number
    skus: number
    publish: number
    publishUrl: string | undefined
    skuItems: unknown[]
}

function stubApi({
    product = makeProduct(),
    detailSkus = [],
    specsResponse = [],
    specsStatus,
}: {
    product?: ProductResponse
    detailSkus?: SkuResponse[]
    specsResponse?: SkuResponse[]
    specsStatus?: number
} = {}): ApiCalls {
    const calls: ApiCalls = {
        detail: 0,
        create: 0,
        basic: 0,
        specs: 0,
        skus: 0,
        publish: 0,
        publishUrl: undefined,
        skuItems: [],
    }
    server.use(
        http.get("*/api/categories/:id/attr-template", () => HttpResponse.json([COLOR_TEMPLATE])),
        http.get("*/seller/products/:id", () => {
            calls.detail += 1
            return HttpResponse.json({ product, skus: detailSkus })
        }),
        http.post("*/seller/products", () => {
            calls.create += 1
            return HttpResponse.json(product, { status: 201 })
        }),
        http.put("*/seller/products/:id", () => {
            calls.basic += 1
            return HttpResponse.json(product)
        }),
        http.put("*/seller/products/:id/specs", () => {
            calls.specs += 1
            if (specsStatus) {
                return HttpResponse.json(apiProblem(specsStatus, { detail: "规格不合法" }), {
                    status: specsStatus,
                })
            }
            return HttpResponse.json(specsResponse)
        }),
        http.put("*/seller/products/:id/skus", async ({ request }) => {
            calls.skus += 1
            // 断言只看「发没发出这一笔、带了几条 sku」，所以就地收窄 items 而不 as 到期望形状：
            // 形状不符时拿到空数组，用例照样会红，不会把错数据洗成对
            const body: unknown = await request.json()
            const items = body && typeof body === "object" ? Reflect.get(body, "items") : undefined
            calls.skuItems = Array.isArray(items) ? items : []
            return HttpResponse.json(specsResponse)
        }),
        http.post("*/seller/products/:id/publish", ({ request }) => {
            calls.publish += 1
            calls.publishUrl = request.url
            return HttpResponse.json(product)
        }),
    )
    return calls
}

function setup(props: { productId?: string } = {}) {
    const { client: queryClient, wrapper } = createAppTestHookClient()
    const onCreated = vi.fn<(id: string) => void>()
    const initialProps = {
        shopId: SHOP_ID,
        categoryId: CATEGORY_ID,
        onCreated,
        ...props,
    }
    const view = renderHook((p: typeof initialProps) => useProductDraft(p), {
        initialProps,
        wrapper,
    })
    // 必须额外 rerender：setSelections 按调用那刻闭包读模板，缓存到位但没重渲染拿到的是 undefined
    const ready = async () => {
        await act(async () => {
            await queryClient.ensureQueryData(categorySpecTemplateOptions(CATEGORY_ID))
            view.rerender(initialProps)
        })
    }
    return { ...view, queryClient, onCreated, ready }
}

describe("useProductDraft 的写请求编排", () => {
    it("新建态选规格只在本地生成组合：一个写库请求都不发（完全显式）", async () => {
        const calls = stubApi()
        const { result, ready } = setup()
        await ready()

        act(() =>
            result.current.setSelections([
                { attrId: COLOR_ATTR_ID, valueIds: [BLACK_ID, WHITE_ID], customValues: [] },
            ]),
        )

        await waitFor(() =>
            expect(result.current.skuRows.map((r) => r.label)).toEqual(["黑色", "白色"]),
        )
        // 建档与规格对账都不该发生：编辑过程零写库是「显式保存」的全部意义
        expect(calls.create).toBe(0)
        expect(calls.specs).toBe(0)
    })

    it("编辑态选值换组合走后端对账，且刚填的价格不被对账结果冲掉", async () => {
        const calls = stubApi({
            product: makeProduct({ name: "在售耳机" }),
            detailSkus: [makeSku(SKU_BLACK, BLACK_ID, "黑色", 19900)],
            specsResponse: [
                makeSku(SKU_BLACK, BLACK_ID, "黑色"),
                makeSku(SKU_WHITE, WHITE_ID, "白色"),
            ],
        })
        const { result, ready } = setup({ productId: PRODUCT_ID })
        await ready()

        // 回填：进页面就该看到服务端那一行，而不是空网格
        await waitFor(() => expect(result.current.skuRows).toHaveLength(1))
        expect(result.current.hydratedBasic).toMatchObject({ name: "在售耳机" })
        // 卖家在这一行填了 88 元
        act(() =>
            result.current.setSkuRows(
                result.current.skuRows.map((row) => ({ ...row, price: money(8800) })),
            ),
        )

        act(() =>
            result.current.setSelections([
                { attrId: COLOR_ATTR_ID, valueIds: [BLACK_ID, WHITE_ID], customValues: [] },
            ]),
        )

        // 编辑态 SKU 已有真实 id，只有后端对账才能保住它
        await waitFor(() => expect(result.current.skuRows).toHaveLength(2))
        expect(calls.specs).toBe(1)
        expect(result.current.skuRows[0]).toMatchObject({ skuId: SKU_BLACK, price: money(8800) })
    })

    it("编辑态清空选值：网格空掉但不向后端发空规格对账", async () => {
        const calls = stubApi({ detailSkus: [makeSku(SKU_BLACK, BLACK_ID, "黑色")] })
        const { result, ready } = setup({ productId: PRODUCT_ID })
        await ready()
        await waitFor(() => expect(result.current.skuRows).toHaveLength(1))

        act(() => result.current.setSelections([]))

        await waitFor(() => expect(result.current.skuRows).toEqual([]))
        expect(calls.specs).toBe(0)
    })

    it("本会话点保存建的文件不回灌：详情查询压根不启用", async () => {
        const calls = stubApi()
        const { result, rerender, queryClient, onCreated, ready } = setup()
        await ready()

        await act(async () => {
            await result.current.submit(BASIC, "draft")
        })
        expect(onCreated).toHaveBeenCalledWith(PRODUCT_ID)

        // 调用方拿到 id 后写回 URL，下一次渲染就带着 productId 了（续编的形状）
        await act(async () => {
            rerender({
                shopId: SHOP_ID,
                categoryId: CATEGORY_ID,
                onCreated,
                productId: PRODUCT_ID,
            })
        })
        // 续编才会拉详情；本会话刚创建的，表单即真相源，拉回来 reset 就是冲掉用户输入
        expect(queryClient.getQueryState(productKeys.detail(PRODUCT_ID))).toBeUndefined()
        expect(calls.detail).toBe(0)
        expect(result.current.hydratedBasic).toBeUndefined()
    })

    it("保存草稿：建档 → basic → 规格，规格落不了也降级存住，且不发布", async () => {
        const calls = stubApi({ specsStatus: 400 })
        const { result, onCreated, ready } = setup()
        await ready()
        act(() =>
            result.current.setSelections([
                { attrId: COLOR_ATTR_ID, valueIds: [BLACK_ID], customValues: [] },
            ]),
        )
        await waitFor(() => expect(result.current.skuRows).toHaveLength(1))

        await act(async () => {
            await result.current.submit(BASIC, "draft")
        })

        expect(onCreated).toHaveBeenCalledWith(PRODUCT_ID)
        expect(calls.create).toBe(1)
        expect(calls.basic).toBe(1)
        expect(calls.specs).toBe(1)
        // 某维度没选值这类规格错误，不该把已经填好的标题/图片一起丢掉
        expect(calls.publish).toBe(0)
    })

    it("提交商品信息：规格失败必须报错，不能像草稿那样静默略过", async () => {
        const calls = stubApi({ specsStatus: 400 })
        const { result, ready } = setup()
        await ready()

        await act(async () => {
            await expect(result.current.submit(BASIC, "submit")).rejects.toBeDefined()
        })

        expect(calls.specs).toBe(1)
        // 规格没落成就不可能有可发布的商品：这一步失败必须挡住后面的发布
        expect(calls.publish).toBe(0)
    })

    it("提交把价格发给后端并发布，发布目标是上架", async () => {
        const calls = stubApi({ specsResponse: [makeSku(SKU_BLACK, BLACK_ID, "黑色", 19900)] })
        const { result, ready } = setup()
        await ready()
        act(() =>
            result.current.setSelections([
                { attrId: COLOR_ATTR_ID, valueIds: [BLACK_ID], customValues: [] },
            ]),
        )
        await waitFor(() => expect(result.current.skuRows).toHaveLength(1))

        await act(async () => {
            await result.current.submit(BASIC, "submit")
        })

        expect(calls.specs).toBe(1)
        expect(calls.skus).toBe(1)
        expect(calls.skuItems).toHaveLength(1)
        expect(calls.publish).toBe(1)
        expect(calls.publishUrl).toContain("target=PUBLISHED")
    })

    it("放入仓库：同一套落库流程，发布目标改成入库", async () => {
        const calls = stubApi({ specsResponse: [makeSku(SKU_BLACK, BLACK_ID, "黑色", 19900)] })
        const { result, ready } = setup()
        await ready()
        act(() =>
            result.current.setSelections([
                { attrId: COLOR_ATTR_ID, valueIds: [BLACK_ID], customValues: [] },
            ]),
        )
        await waitFor(() => expect(result.current.skuRows).toHaveLength(1))

        await act(async () => {
            await result.current.submit(BASIC, "warehouse")
        })

        expect(calls.publish).toBe(1)
        expect(calls.publishUrl).toContain("target=WAREHOUSE")
    })

    it("草稿没设价的 SKU 不发落库请求：宁可留着下次补，也不写 0 元", async () => {
        // 规格对账返回的行价格就是 null（卖家还没填）
        const calls = stubApi({ specsResponse: [makeSku(SKU_BLACK, BLACK_ID, "黑色", null)] })
        const { result, ready } = setup()
        await ready()
        act(() =>
            result.current.setSelections([
                { attrId: COLOR_ATTR_ID, valueIds: [BLACK_ID], customValues: [] },
            ]),
        )
        await waitFor(() => expect(result.current.skuRows).toHaveLength(1))

        await act(async () => {
            await result.current.submit(BASIC, "draft")
        })

        expect(calls.basic).toBe(1)
        expect(calls.skus).toBe(0)
        expect(calls.publish).toBe(0)
    })
})

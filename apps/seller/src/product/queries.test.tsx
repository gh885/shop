import { money } from "@shop/common/domain"
import { act, renderHook, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { createAppTestHookClient, createAppTestQueryClient } from "@shop/app-kit/test"

import { productKeys, productListOptions, useUpdateProductSkus } from "./queries"

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001"
const OTHER_ID = "00000000-0000-4000-8000-000000000002"

describe("商品数据接线", () => {
    it("SKU 保存只失效提交参数对应的商品，并在通知页面之前标记缓存", async () => {
        const { client: queryClient, wrapper } = createAppTestHookClient()
        for (const id of [PRODUCT_ID, OTHER_ID]) {
            queryClient.setQueryData(productKeys.detail(id), { id })
        }
        let body: unknown
        let invalidatedWhenSaved: boolean | undefined
        server.use(
            http.put("*/seller/products/:id/skus", async ({ request, params }) => {
                expect(params.id).toBe(PRODUCT_ID)
                body = await request.json()
                return HttpResponse.json([])
            }),
        )
        const { result } = renderHook(
            () =>
                useUpdateProductSkus("已保存", () => {
                    invalidatedWhenSaved = queryClient.getQueryState(
                        productKeys.detail(PRODUCT_ID),
                    )?.isInvalidated
                }),
            { wrapper },
        )
        const items = [{ skuId: OTHER_ID, price: money(1200), stock: 3 }]
        act(() => result.current.mutate({ productId: PRODUCT_ID, items }))
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(body).toEqual({ items })
        expect(invalidatedWhenSaved).toBe(true)
        expect(queryClient.getQueryState(productKeys.detail(OTHER_ID))?.isInvalidated).toBe(false)
    })

    it("列表直接使用 SDK 时保留分页、筛选、排序参数及返回记录", async () => {
        let search: URLSearchParams | undefined
        server.use(
            http.get("*/seller/products", ({ request }) => {
                search = new URL(request.url).searchParams
                return HttpResponse.json({ records: [], total: 0 })
            }),
        )
        const queryClient = createAppTestQueryClient()
        const data = await queryClient.fetchQuery(
            productListOptions(PRODUCT_ID, {
                page: 2,
                size: 10,
                status: "DRAFT",
                keyword: "测试",
                sort: "stock_asc",
            }),
        )
        expect(data).toMatchObject({ records: [], total: 0 })
        expect(Object.fromEntries(search!)).toMatchObject({
            page: "2",
            size: "10",
            status: "DRAFT",
            keyword: "测试",
            sort: "stock_asc",
        })
    })
})

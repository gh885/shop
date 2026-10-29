import { message } from "#/locales/message"
import { act, renderHook, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { createAppTestHookClient } from "@shop/app-kit/test"

import { productKeys, useUpdateProductSkus } from "./queries"

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001"
const OTHER_ID = "00000000-0000-4000-8000-000000000002"
const DETAIL_ID = "00000000-0000-4000-8000-000000000003"

// 改 SKU 的契约响应是完整卖家详情；给最小合法形状，只验缓存失效路径
const updatedDetail = {
    spuId: PRODUCT_ID,
    title: "测试商品",
    subtitle: "",
    categoryId: DETAIL_ID,
    brandId: DETAIL_ID,
    modelNo: "",
    sevenDayReturn: true,
    soldCount: 0,
    images: [],
    detailImages: [],
    attributes: [],
    specImages: [],
    skus: [],
    listingId: DETAIL_ID,
    listingStatus: "draft",
    rejectReason: "",
}

describe("useUpdateProductSkus", () => {
    it("SKU 保存只失效提交参数对应的商品，并在通知页面之前标记缓存", async () => {
        const { client: queryClient, wrapper } = createAppTestHookClient()
        for (const id of [PRODUCT_ID, OTHER_ID]) {
            queryClient.setQueryData(productKeys.detail(id), { id })
        }
        let invalidatedWhenSaved: boolean | undefined
        server.use(http.put("*/seller/products/:id/skus", () => HttpResponse.json(updatedDetail)))
        const { result } = renderHook(
            () =>
                useUpdateProductSkus(message("product.toast.skuOkStock"), () => {
                    invalidatedWhenSaved = queryClient.getQueryState(
                        productKeys.detail(PRODUCT_ID),
                    )?.isInvalidated
                }),
            { wrapper },
        )
        act(() => result.current.mutate({ productId: PRODUCT_ID, items: [] }))
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(invalidatedWhenSaved).toBe(true)
        expect(queryClient.getQueryState(productKeys.detail(OTHER_ID))?.isInvalidated).toBe(false)
    })
})

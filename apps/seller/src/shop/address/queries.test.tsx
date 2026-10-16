import { useSuspenseQuery } from "@tanstack/react-query"
import { Suspense } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"

import { createAppTestHookClient } from "@shop/app-kit/test"

import { addressListOptions, useDeleteAddress } from "./queries"

const SHOP_ID = "00000000-0000-4000-8000-000000000001"
const OTHER_SHOP_ID = "00000000-0000-4000-8000-000000000002"
const ADDRESS_ID = "00000000-0000-4000-8000-000000000003"

async function setup() {
    const { client: queryClient, wrapper: withClient } = createAppTestHookClient()
    server.use(http.get("*/seller/addresses", () => HttpResponse.json([])))
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Suspense fallback={null}>{withClient({ children })}</Suspense>
    )
    const lists = renderHook(
        () => [
            useSuspenseQuery(addressListOptions(SHOP_ID)),
            useSuspenseQuery(addressListOptions(OTHER_SHOP_ID)),
        ],
        { wrapper },
    )
    await waitFor(() => expect(lists.result.current.every((query) => query.isSuccess)).toBe(true))
    lists.unmount()
    const mutation = renderHook(() => useDeleteAddress(SHOP_ID), { wrapper })
    const invalidated = (shopId: string) =>
        queryClient
            .getQueryCache()
            .getAll()
            .find((query) => query.queryKey.includes(shopId))?.state.isInvalidated
    return { ...mutation, invalidated }
}

describe("地址删除的缓存范围", () => {
    it("成功只失效当前店铺地址，不影响另一家店", async () => {
        server.use(
            http.delete("*/seller/addresses/:id", () => new HttpResponse(null, { status: 204 })),
        )
        const { result, invalidated } = await setup()
        act(() => result.current.mutate(ADDRESS_ID))
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(invalidated(SHOP_ID)).toBe(true)
        expect(invalidated(OTHER_SHOP_ID)).toBe(false)
    })

    it("删除失败不失效已有地址缓存", async () => {
        server.use(
            http.delete("*/seller/addresses/:id", () =>
                HttpResponse.json({ status: 500, detail: "删除失败" }, { status: 500 }),
            ),
        )
        const { result, invalidated } = await setup()
        act(() => result.current.mutate(ADDRESS_ID))
        await waitFor(() => expect(result.current.isError).toBe(true))
        expect(invalidated(SHOP_ID)).toBe(false)
        expect(invalidated(OTHER_SHOP_ID)).toBe(false)
    })
})

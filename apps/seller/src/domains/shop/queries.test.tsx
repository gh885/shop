import { act, screen, waitFor } from "@testing-library/react"
import { HttpResponse, http } from "msw"
import { afterEach, describe, expect, it } from "vite-plus/test"

import type { ShopResponse } from "@shop/api/sdk"
import { createAppTestQueryClient, renderWithProviders } from "@shop/app-kit/test"
import { server } from "@shop/test-utils"

import { tokenStore } from "../../shared/lib/api"
import { getCurrentShopId, setCurrentShopId, shopSelectionStore } from "../../shared/lib/shop-store"
import { shopKeys, useCurrentShop } from "./queries"

const SHOP_A: ShopResponse = {
    id: "shop-a",
    ownerId: "owner",
    name: "甲店",
    logoKey: null,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    rejectReason: null,
}
const SHOP_B: ShopResponse = { ...SHOP_A, id: "shop-b", name: "乙店" }

function Selection({ label }: { label: string }) {
    const shop = useCurrentShop()
    return <output aria-label={label}>{shop?.id ?? "无店铺"}</output>
}

function renderSelection(shops = [SHOP_A, SHOP_B]) {
    tokenStore.set("test-token")
    server.use(http.get("*/shops/mine", () => HttpResponse.json(shops)))
    const client = createAppTestQueryClient()
    client.setQueryData(shopKeys.mine(), shops)
    renderWithProviders(
        <>
            <Selection label="导航" />
            <Selection label="页面" />
        </>,
        { queryClient: client },
    )
    return client
}

afterEach(() => {
    tokenStore.clear()
    setCurrentShopId(undefined)
})

describe("当前店铺的 Zustand 订阅与 Query 解析", () => {
    it("显式切店同时更新多个消费者和请求头，不复制店铺实体", () => {
        setCurrentShopId("shop-a")
        renderSelection()
        expect(screen.getByLabelText("导航")).toHaveTextContent("shop-a")

        act(() => setCurrentShopId("shop-b"))

        expect(screen.getByLabelText("导航")).toHaveTextContent("shop-b")
        expect(screen.getByLabelText("页面")).toHaveTextContent("shop-b")
        expect(getCurrentShopId()).toBe("shop-b")
        expect(shopSelectionStore.getState()).toBe("shop-b")
    })

    it("打开页面优先使用记住的营业店铺，不强制回到第一家", () => {
        setCurrentShopId("shop-b")
        renderSelection()
        expect(screen.getByLabelText("页面")).toHaveTextContent("shop-b")
        expect(getCurrentShopId()).toBe("shop-b")
    })

    it.each([undefined, "shop-missing", "shop-disabled"])(
        "选择 %s 不可用时，兜底营业店但不改写用户记忆",
        (selection) => {
            setCurrentShopId(selection)
            renderSelection([{ ...SHOP_A, id: "shop-disabled", status: "DISABLED" }, SHOP_B])

            expect(screen.getByLabelText("页面")).toHaveTextContent("shop-b")
            expect(getCurrentShopId()).toBe("shop-b")
            expect(shopSelectionStore.getState()).toBe(selection)
        },
    )

    it("Query 更新营业状态后重新解析；没有营业店时清除请求头", async () => {
        setCurrentShopId("shop-b")
        const client = renderSelection()

        act(() => {
            client.setQueryData(shopKeys.mine(), [SHOP_A, { ...SHOP_B, status: "DISABLED" }])
        })
        await waitFor(() => expect(screen.getByLabelText("页面")).toHaveTextContent("shop-a"))
        expect(getCurrentShopId()).toBe("shop-a")
        expect(shopSelectionStore.getState()).toBe("shop-b")

        act(() => {
            client.setQueryData(shopKeys.mine(), [])
        })
        await waitFor(() => expect(screen.getByLabelText("页面")).toHaveTextContent("无店铺"))
        expect(getCurrentShopId()).toBeUndefined()
    })
})

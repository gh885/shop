import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { renderWithProviders } from "@shop/test-utils"
import { FavoriteCard } from "./FavoriteCard"
import type { FavoriteItem } from "./favorite"

function makeFavorite(overrides: Partial<FavoriteItem> = {}): FavoriteItem {
    return {
        id: "fav-1",
        productId: "product-1",
        favoritedAt: "2026-09-17T10:00:00Z",
        title: "演示商品",
        image: undefined,
        price: undefined,
        collectCount: 12,
        available: true,
        ...overrides,
    }
}

describe("FavoriteCard 移出按钮", () => {
    it("键盘 Tab 能聚焦到移出按钮并触发移除（不能因 hover 显现而被键盘埋没）", async () => {
        const user = userEvent.setup()
        const onRemove = vi.fn<(productId: string) => void>()
        renderWithProviders(
            <FavoriteCard
                favorite={makeFavorite()}
                onRemove={onRemove}
            />,
        )

        const remove = screen.getByRole("button", { name: "移出" })
        expect(remove).not.toHaveStyle({ display: "none" })
        remove.focus()
        expect(remove).toHaveFocus()
        await user.click(remove)
        expect(onRemove).toHaveBeenCalledExactlyOnceWith("product-1")
    })
})

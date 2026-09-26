import { describe, expect, it } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithRouter } from "@shop/app-kit/test"
import { adminMessages } from "#/locales"
import { AppSidebar } from "./app-sidebar"

describe("管理端共享侧栏", () => {
    it("根路径审核页同时高亮商家与入驻审核，点击菜单保留分页参数", async () => {
        const user = userEvent.setup()
        const { router } = renderWithRouter(<AppSidebar />, { resources: adminMessages })
        const review = await screen.findByRole("link", { name: "入驻审核" })
        expect(review).toHaveAttribute("aria-current", "page")
        const merchant = screen.getByRole("button", { name: "商家" })
        expect(merchant).toHaveAttribute("aria-current", "true")
        expect(review).toHaveAttribute("href", "/?page=1&size=20")
        expect(merchant).toHaveAttribute("href", "/?page=1&size=20")
        await user.click(review)
        await waitFor(() =>
            expect(router.state.location.search).toMatchObject({ page: 1, size: 20 }),
        )
    })
})

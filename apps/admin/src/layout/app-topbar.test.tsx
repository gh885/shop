import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithRouter } from "@shop/app-kit/test"
import { AppTopBar } from "./app-topbar"

describe("管理端共享顶栏", () => {
    it("显示平台品牌和审核页名，账号弹层提供可键盘操作的退出按钮", async () => {
        const user = userEvent.setup()
        renderWithRouter(<AppTopBar />)
        const brand = await screen.findByRole("link", { name: "Shop 平台" })
        expect(brand).toHaveAttribute("href", "/?page=1&size=20")
        expect(screen.getByText("入驻审核")).toBeInTheDocument()
        expect(screen.queryByText("卖家账号")).not.toBeInTheDocument()
        const account = screen.getByRole("button", { name: /管理员账号/ })
        account.focus()
        await user.keyboard("{Enter}")
        expect(await screen.findByRole("button", { name: "退出登录" })).toBeEnabled()
    })
})

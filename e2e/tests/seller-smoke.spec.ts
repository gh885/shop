import { expect, test } from "@playwright/test"

const SELLER_URL = process.env.E2E_SELLER_URL

test.describe("卖家工作台", () => {
    test("登录后选择店铺并打开订单工作台", async ({ page }) => {
        test.skip(!SELLER_URL, "未设置 E2E_SELLER_URL，跳过卖家 E2E")
        await page.goto(`${SELLER_URL}/shop/list`)
        await expect(page.getByRole("heading", { name: "店铺管理" })).toBeVisible()

        const selectShop = page.getByRole("button", { name: "设为当前店铺" }).first()
        if (await selectShop.isVisible().catch(() => false)) await selectShop.click()
        await page.goto(`${SELLER_URL}/trade/order`)
        await expect(page).toHaveURL(/\/trade\/order/)
        await expect(
            page.getByText("没有符合条件的订单").or(page.getByText("订单号")).first(),
        ).toBeVisible()
    })
})

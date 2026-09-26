import { expect, test } from "@playwright/test"

import { SELLER_URL } from "../fixtures/env"
import { readManifest } from "../fixtures/run"

/** 卖家工作台冒烟：店铺列表里只有本轮那一家店，订单工作台打得开 */
test.describe("卖家工作台", () => {
    test("登录后选择店铺并打开订单工作台", async ({ page }) => {
        test.skip(!SELLER_URL, "未设置 E2E_SELLER_URL，跳过卖家 E2E")
        const run = await readManifest()

        await page.goto(`${SELLER_URL}/shop/list`)
        await expect(page.getByRole("heading", { name: "店铺管理" })).toBeVisible()
        const ownShop = page.getByText(run.seller.shopName)
        await expect(ownShop.first()).toBeVisible()
        // 每轮现注册：列表里出现别家的名字，说明这轮没有跟历史数据隔离开
        await expect(ownShop).toHaveCount(1)

        const selectShop = page.getByRole("button", { name: "设为当前店铺" })
        if (await selectShop.isVisible().catch(() => false)) await selectShop.click()

        await page.goto(`${SELLER_URL}/trade/order`)
        await expect(page).toHaveURL(/\/trade\/order/)
        await expect(
            page.getByText("没有符合条件的订单").or(page.getByText("订单号")).first(),
        ).toBeVisible()
    })
})

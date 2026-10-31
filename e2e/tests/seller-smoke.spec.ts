import { expect, test } from "@playwright/test"

import { SELLER_URL } from "../fixtures/env"
import { readManifest } from "../fixtures/run"

/** 卖家工作台冒烟：店铺设置里是本轮那一家店，订单工作台打得开。店铺断言用输入框的值（数据），不随界面语言变。 */
test.describe("卖家工作台", () => {
    test("登录后店铺设置可见本轮店铺并打开订单工作台", async ({ page }) => {
        test.skip(!SELLER_URL, "未设置 E2E_SELLER_URL，跳过卖家 E2E")
        const run = await readManifest()

        await page.goto(`${SELLER_URL}/shop/settings`)
        await expect(page.getByRole("textbox", { name: "店铺名称" })).toHaveValue(
            run.seller.shopName,
        )

        await page.goto(`${SELLER_URL}/trade/order`)
        await expect(page).toHaveURL(/\/trade\/order/)
        await expect(
            page.getByText("没有符合条件的订单").or(page.getByText("订单号")).first(),
        ).toBeVisible()
    })
})

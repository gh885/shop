import { expect, test } from "@playwright/test"

import { readManifest } from "../fixtures/run"

/** 买家下单主路径：商品与地址都来自本轮自己造的那一套，取数不再从商品列表第一页里捞 */
test.describe("下单主路径", () => {
    test("登录买家从商品详情立即购买并提交订单", async ({ page }) => {
        const run = await readManifest()

        await page.goto(`/products/${run.product.productId}`)
        await expect(page.getByRole("heading", { name: run.product.name }).first()).toBeVisible()
        // 逐维点选规格。SSR 首屏就已渲染出这些按钮，水合完成前的点击会被丢掉，
        // 所以每维重试到 aria-pressed 真的翻上来为止
        for (const attribute of run.product.attributes) {
            const value = page.getByRole("button", { name: attribute.value, exact: true })
            // oxlint-disable-next-line eslint/no-await-in-loop -- 下一维要等上一维确认选中，串行是有意的
            await expect
                .poll(
                    async () => {
                        await value.click()
                        return await value.getAttribute("aria-pressed")
                    },
                    { message: `规格「${attribute.name}=${attribute.value}」选不上` },
                )
                .toBe("true")
        }
        await page.getByRole("button", { name: "立即购买" }).click()

        await expect(page).toHaveURL(/\/checkout\?/)
        await expect(page.getByText("应付总额：")).toBeVisible()
        // 结算分组是本轮注册并审核通过的那家店——买到的不是演示库残留，隔离在此刻成立
        await expect(page.getByText(run.seller.shopName).first()).toBeVisible()

        await page.getByRole("button", { name: "提交订单" }).click()
        await expect(page).toHaveURL(/\/pay\/[0-9a-f-]{36}/)
        await expect(page.getByRole("button", { name: "确认支付" })).toBeVisible()
        await page.getByRole("button", { name: "确认支付" }).click()
        await expect(
            page.getByRole("main").getByRole("heading", { name: "支付成功" }),
        ).toBeVisible()
        await expect(page.getByText("订单已支付，等待商家发货。")).toBeVisible()
    })
})

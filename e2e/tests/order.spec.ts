import { expect, test, type Locator } from "@playwright/test"

import { readManifest } from "../fixtures/run"

/** 买家下单主路径：商品与地址都来自本轮自己造的那一套，取数不再从商品列表第一页里捞 */
test.describe("下单主路径", () => {
    test("登录买家从商品详情立即购买并提交订单", async ({ page }) => {
        const run = await readManifest()

        await page.goto(`/products/${run.product.productId}`, { waitUntil: "networkidle" })
        await expect(page.getByRole("heading", { name: run.product.name }).first()).toBeVisible()
        // 逐维点选规格
        for (const attribute of run.product.attributes) {
            const value = page.getByRole("button", { name: attribute.value, exact: true })
            // oxlint-disable-next-line eslint/no-await-in-loop -- 下一维要等上一维确认选中，串行是有意的
            await pickSpec(value, `${attribute.name}=${attribute.value}`)
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

/**
 * 点选一个规格值，等到 aria-pressed 真的翻上来。
 *
 * 点击不能像 expect.poll 那样每 100ms 补一次：选中态是 toggle
 * （use-sku-selection：同值再点一次即取消），一串点击把选中/取消来回翻，而每次读都发生在
 * 「?spec= 落进 URL → 路由提交 → 重渲染」之前，读到的永远是上一帧的 false。CI 上实测 5s
 * 预算内一次都没读到 true，而超时后快照里这个按钮是 [pressed]——钱就是这么白花在水合上。
 * 改成点一次给足提交预算；只有确凿还是 false 才补点（toHaveAttribute 全程在重读，提交落在
 * 预算内就会被读到 true，所以补点那次状态一定是可取消的反面）。
 */
async function pickSpec(value: Locator, label: string): Promise<void> {
    for (const timeout of [10_000, 3_000]) {
        await value.click()
        try {
            await expect(value).toHaveAttribute("aria-pressed", "true", { timeout })
            return
        } catch {
            // 首屏 SSR 就渲染出这些按钮，水合未完成时这一击会被丢掉
        }
    }
    throw new Error(`规格「${label}」选不上`)
}

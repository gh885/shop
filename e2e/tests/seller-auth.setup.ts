import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { expect, test as setup } from "@playwright/test"

import { SELLER_URL } from "../fixtures/env"
import { loginSeller } from "../fixtures/ui-auth"
import { readManifest } from "../fixtures/run"

const AUTH_STATE = "e2e/playwright/.auth/seller.json"

/**
 * 卖家登录态：店铺本轮现注册、现审核通过。
 * 落状态前先看商品列表——`/seller/**` 全部按 X-Shop-Id 定店，列表里只可能出现本轮那一个商品，
 * 这就同时证明了店铺上下文已经解析到我们自己那家店上。
 */
setup("卖家登录态", async ({ page }) => {
    setup.skip(!SELLER_URL, "未设置 E2E_SELLER_URL，跳过卖家 E2E")
    const run = await readManifest()
    await mkdir(dirname(AUTH_STATE), { recursive: true })

    await loginSeller(page, run)
    await expect(page.getByText(run.product.name)).toBeVisible()
    await page.context().storageState({ path: AUTH_STATE })
})

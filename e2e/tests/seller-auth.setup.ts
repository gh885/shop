import { mkdir } from "node:fs/promises"
import { expect, test, test as setup } from "@playwright/test"

const SELLER_PHONE = process.env.E2E_SELLER_PHONE ?? "13800002001"
const SELLER_PASSWORD = process.env.E2E_SELLER_PASSWORD ?? "shop123456"
const SELLER_URL = process.env.E2E_SELLER_URL

setup("卖家登录态", async ({ page }) => {
    test.skip(!SELLER_URL, "未设置 E2E_SELLER_URL，跳过卖家 E2E")
    await mkdir("e2e/playwright/.auth", { recursive: true })
    await page.goto(`${SELLER_URL}/login`)
    await page.getByRole("button", { name: "密码登录" }).click()
    await page.getByLabel("手机号").fill(SELLER_PHONE)
    await page.getByLabel("密码").fill(SELLER_PASSWORD)
    await page.getByRole("button", { name: "登录", exact: true }).click()
    await expect(page).toHaveURL(/\/product\/list/)
    await page.context().storageState({ path: "e2e/playwright/.auth/seller.json" })
})

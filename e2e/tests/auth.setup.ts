import { mkdir } from "node:fs/promises"
import { expect, test as setup } from "@playwright/test"

const PHONE = process.env.E2E_BUYER_PHONE ?? "13800001001"
const PASSWORD = process.env.E2E_BUYER_PASSWORD ?? "shop123456"
const AUTH_STATE = "e2e/playwright/.auth/buyer.json"

setup("买家登录态", async ({ page }) => {
    await mkdir("playwright/.auth", { recursive: true })
    await page.goto("/")

    await page.getByRole("button", { name: "登录", exact: true }).click()
    await page.getByRole("button", { name: "密码登录" }).click()
    await page.getByLabel("手机号").fill(PHONE)
    await page.getByLabel("密码").fill(PASSWORD)
    await page.getByRole("button", { name: "登录", exact: true }).last().click()

    await expect(page.getByText("登录后畅享更多功能")).toBeHidden()
    await page.context().storageState({ path: AUTH_STATE })
})

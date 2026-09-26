import { mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { test as setup } from "@playwright/test"

import { loginBuyer } from "../fixtures/ui-auth"
import { readManifest } from "../fixtures/run"

const AUTH_STATE = "e2e/playwright/.auth/buyer.json"

/** 买家登录态：账号是本轮 globalSetup 现注册的，密码也现设，不依赖演示库那批固定号 */
setup("买家登录态", async ({ page }) => {
    const run = await readManifest()
    await mkdir(dirname(AUTH_STATE), { recursive: true })
    await loginBuyer(page, run)
    await page.context().storageState({ path: AUTH_STATE })
})

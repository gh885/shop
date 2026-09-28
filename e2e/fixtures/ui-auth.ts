import { expect, type Page } from "@playwright/test"

import { SELLER_URL, WEB_URL } from "./env"
import type { RunManifest } from "./run"

/**
 * 两端登录的 UI 路径。setup 项目与跨角色用例共用同一份：
 * 换轮账号只改清单，不改正向流程的走位。
 * 「密码」一律 exact 匹配：PasswordField 的「显示密码」按钮可访问名里含着两个字，子串匹配会撞上两个元素。
 */

/** 买家：首页头部「登录」拉起弹窗，密码 Tab 提交 */
export async function loginBuyer(page: Page, run: RunManifest): Promise<void> {
    await page.goto(`${WEB_URL}/`)
    await page.getByRole("button", { name: "登录", exact: true }).click()
    await page.getByRole("tab", { name: "密码登录" }).click()
    await page.getByLabel("手机号").fill(run.buyer.phone)
    await page.getByLabel("密码", { exact: true }).fill(run.buyer.password)
    await page.getByRole("button", { name: "登录", exact: true }).last().click()
    await expect(page.getByRole("dialog", { name: "登录/注册" })).toBeHidden()
}

/** 卖家：独立登录页，成功后落商品列表 */
export async function loginSeller(page: Page, run: RunManifest): Promise<void> {
    if (!SELLER_URL) throw new Error("未设置 E2E_SELLER_URL")
    await page.goto(`${SELLER_URL}/login`)
    await page.getByRole("tab", { name: "密码登录" }).click()
    await page.getByLabel("手机号").fill(run.seller.phone)
    await page.getByLabel("密码", { exact: true }).fill(run.seller.password)
    await page.getByRole("button", { name: "登录", exact: true }).click()
    await expect(page).toHaveURL(/\/product\/list/)
}

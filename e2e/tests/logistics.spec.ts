import { expect, test } from "@playwright/test"

import { recordTrackingNode } from "../fixtures/api"
import { shipmentIdByTrackingNo } from "../fixtures/db"
import { SELLER_URL, WEB_URL } from "../fixtures/env"
import { readManifest } from "../fixtures/run"
import { loginBuyer, loginSeller } from "../fixtures/ui-auth"

const CARRIER_NAME = "顺丰速运"
const NODE_DESCRIPTION = "已到达上海转运中心"

/**
 * 第三阶段主链路：卖家发货 → 轨迹节点录入 → 买家查看物流，同一笔单跑完两个角色。
 *
 * 两端各开一个 context 并各自现登录：refresh token 是一次一换的，两个项目共用一份
 * storageState 时，先跑的那个会把状态文件里的凭据换掉，后跑的只剩无效会话。
 * 卖家侧顺带把 X-Shop-Id 钉在本轮新店上。
 */
test.describe("发货与物流轨迹", () => {
    test("卖家发货并录入轨迹节点后，买家能看到这条轨迹", async ({ browser }) => {
        test.skip(!SELLER_URL, "未设置 E2E_SELLER_URL，跳过卖家 E2E")
        const run = await readManifest()

        const sellerContext = await browser.newContext()
        const sellerPage = await sellerContext.newPage()
        await loginSeller(sellerPage, run)

        const ordersCall = sellerPage.waitForRequest((request) =>
            request.url().includes("/seller/orders"),
        )
        await sellerPage.goto(`${SELLER_URL}/trade/order`)
        await sellerPage.getByRole("tab", { name: "待发货" }).click()
        // 跨角色上下文：这一屏的卖家身份头必须指向本轮自己开的那家店
        const ordersRequest = await ordersCall
        expect(ordersRequest.headers()["x-shop-id"]).toBe(run.seller.shopId)

        const orderRow = sellerPage.getByRole("row").filter({ hasText: run.order.orderNo })
        await expect(orderRow).toBeVisible()
        // 「发货」按钮是按契约下发的动作集条件渲染的（canShip = availableActions.includes("SHIP")），
        // 且行内还有发货中的 busy 态会把它 disabled。行先可见不等于按钮此刻可点——列表查询
        // resolve 与动作集/busy 态就绪之间有一小段窗口。所以显式等它 enabled 再点：click 自带的
        // actionability 等待在失败时只给「click 超时」这种无指向的报错，这里让它报在「按钮一直
        // 不可点」上，排查时一眼能看出卡在哪一态。
        const shipButton = orderRow.getByRole("button", { name: "发货", exact: true })
        await expect(shipButton).toBeEnabled()
        await shipButton.click()

        const dialog = sellerPage.getByRole("dialog")
        await expect(dialog.getByText(run.order.orderNo)).toBeVisible()
        await dialog.locator("[data-slot=select-trigger]").click()
        await sellerPage.getByRole("option", { name: CARRIER_NAME }).click()
        await dialog.getByLabel("运单号").fill(run.trackingNo)
        // 同上：提交态 pending 时按钮是 disabled，等它可点再点
        const confirmShip = dialog.getByRole("button", { name: "发货", exact: true })
        await expect(confirmShip).toBeEnabled()
        await confirmShip.click()

        await expect(sellerPage.getByText("已发货").first()).toBeVisible()
        await sellerPage.getByRole("tab", { name: "已发货" }).click()
        await expect(orderRow).toBeVisible()

        // 轨迹录入这条入口还没有管理端 UI（apps/admin 未接），按产品口径走平台 admin API
        await recordTrackingNode({
            shipmentId: shipmentIdByTrackingNo(run.trackingNo),
            nodeCode: "ARRIVED_HUB",
            description: NODE_DESCRIPTION,
            location: "上海",
            occurredAt: new Date().toISOString(),
        })

        const buyerContext = await browser.newContext()
        const buyerPage = await buyerContext.newPage()
        await loginBuyer(buyerPage, run)
        await buyerPage.goto(`${WEB_URL}/orders/${run.order.orderId}`)
        await buyerPage.getByRole("button", { name: "查看物流" }).click()
        await expect(buyerPage).toHaveURL(new RegExp(`/logistics/${run.order.orderId}`))

        await expect(buyerPage.getByRole("heading", { name: "物流详情" })).toBeVisible()
        await expect(buyerPage.getByText(run.trackingNo)).toBeVisible()
        await expect(buyerPage.getByText(CARRIER_NAME)).toBeVisible()
        // 时间线默认只摊开两条，本轮这条在折叠区里
        const expand = buyerPage.getByRole("button", { name: "展开更多物流明细" })
        if (await expand.isVisible().catch(() => false)) await expand.click()
        await expect(buyerPage.getByText(NODE_DESCRIPTION)).toBeVisible()
        await expect(buyerPage.getByText("运输中").first()).toBeVisible()
    })
})

import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vitest"

import type { SellerOrderListItemResponse } from "@shop/api/sdk"
import { makeTicket, server } from "@shop/test-utils"

import { renderWithProviders } from "#/test/render"

import { AfterSaleDecisionDialog, type SaleDecisionKind } from "./after-sale-decision-dialog"

/**
 * 售后决策弹窗测试：卖家在点「同意」之前必须看得见自己要答应什么。
 *
 * 钉住两件事：
 * 1. 同意之后的走向按售后类型分岔（仅退款 = 点完就退钱；退货退款 = 先等货回来）——
 *    这两句话在弹窗里必须不同，否则卖家是在凭信仰批钱；
 * 2. 售后单拉不到时不拦人：降级成说明 + 照常可确认。
 */

const SHOP_ID = "shop-1"

/** 测试夹具：弹窗只读 id / orderNo，其余字段求契约合法 */
function makeOrder(
    overrides: Partial<SellerOrderListItemResponse> = {},
): SellerOrderListItemResponse {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        orderNo: "NO20260912001",
        status: "COMPLETED",
        afterSaleStatus: "APPLYING",
        availableActions: [],
        payAmount: { amount: 19900, currency: "CNY" },
        receiverName: "张三",
        receiverPhone: "13800000000",
        itemCount: 1,
        items: [],
        shipExpireAt: null,
        createdAt: "2026-09-12T10:00:00Z",
        ...overrides,
    }
}

function renderDialog({
    kind = "agree",
    order = makeOrder(),
    onConfirm = vi.fn<() => void>(),
}: {
    kind?: SaleDecisionKind
    order?: SellerOrderListItemResponse
    onConfirm?: () => void
} = {}) {
    renderWithProviders(
        <AfterSaleDecisionDialog
            open
            onOpenChange={vi.fn<(open: boolean) => void>()}
            kind={kind}
            orderId={order.id}
            orderNo={order.orderNo}
            shopId={SHOP_ID}
            onConfirm={onConfirm}
        />,
    )
    return { onConfirm }
}

describe("AfterSaleDecisionDialog", () => {
    it("仅退款：说明「同意即退款、商品不寄回」，并摊开买家理由与退款金额", async () => {
        server.use(
            http.get("*/seller/orders/:id/after-sales", () =>
                HttpResponse.json(
                    makeTicket({
                        id: crypto.randomUUID(),
                        type: "REFUND_ONLY",
                        reason: "包装破损",
                        refundAmount: { amount: 19900, currency: "CNY" },
                    }),
                ),
            ),
        )

        renderDialog()

        expect(await screen.findByText("同意后立即退款给买家，商品不寄回。")).toBeInTheDocument()
        expect(screen.getByText("包装破损")).toBeInTheDocument()
        expect(screen.getByText("¥199.00")).toBeInTheDocument()
    })

    it("退货退款：说明变成「先等货回来」——同一颗同意按钮，资金与货物的走向完全不同", async () => {
        server.use(
            http.get("*/seller/orders/:id/after-sales", () =>
                HttpResponse.json(makeTicket({ id: crypto.randomUUID(), type: "RETURN_REFUND" })),
            ),
        )

        renderDialog()

        expect(
            await screen.findByText("同意后进入退货流程：买家寄回、你确认收货后才退款并回补库存。"),
        ).toBeInTheDocument()
        expect(screen.getByText("退货退款")).toBeInTheDocument()
    })

    it("确认收货：把退回的运单号摆出来给卖家核对", async () => {
        server.use(
            http.get("*/seller/orders/:id/after-sales", () =>
                HttpResponse.json(
                    makeTicket({
                        id: crypto.randomUUID(),
                        type: "RETURN_REFUND",
                        status: "RETURNING",
                        returnLogisticsCompany: "顺丰速运",
                        returnTrackingNo: "SF123456",
                    }),
                ),
            ),
        )

        renderDialog({ kind: "receive" })

        expect(await screen.findByText("顺丰速运 SF123456")).toBeInTheDocument()
        expect(
            screen.getByText("确认后立即退款给买家并回补库存，请先核对退回的包裹。"),
        ).toBeInTheDocument()
    })

    it("没有售后记录（404）：降级成说明但照常可确认，不把卖家锁在门外", async () => {
        // 默认 handler 即 404（无售后记录），这里不覆盖
        const { onConfirm } = renderDialog()

        expect(await screen.findByText("没有查到售后单，请谨慎处理。")).toBeInTheDocument()
        await userEvent.setup().click(screen.getByRole("button", { name: "确认同意" }))

        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    })

    it("服务端故障不能被当作无售后记录：展示读取失败，但仍允许确认", async () => {
        server.use(
            http.get("*/seller/orders/:id/after-sales", () =>
                HttpResponse.json({ detail: "服务暂不可用" }, { status: 500 }),
            ),
        )

        const { onConfirm } = renderDialog()

        expect(
            await screen.findByText("售后单读取失败，请先与买家确认售后内容再决定。"),
        ).toBeInTheDocument()
        expect(screen.queryByText("没有查到售后单，请谨慎处理。")).not.toBeInTheDocument()
        await userEvent.setup().click(screen.getByRole("button", { name: "确认同意" }))

        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    })

    it("拒绝：文案说明买家窗口内可重新申请（后端确实允许，别说成一次定生死）", async () => {
        server.use(
            http.get("*/seller/orders/:id/after-sales", () =>
                HttpResponse.json(makeTicket({ id: crypto.randomUUID() })),
            ),
        )

        renderDialog({ kind: "reject" })

        expect(
            await screen.findByText("拒绝后买家仍可在申请窗口内重新提交申请。"),
        ).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "确认拒绝" })).toBeInTheDocument()
    })
})

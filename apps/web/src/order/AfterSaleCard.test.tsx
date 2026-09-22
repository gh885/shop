import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { TicketResponse } from "@shop/api/sdk"
import { makeTicket } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { AfterSaleCard } from "./AfterSaleCard"
import type { AfterSaleAction } from "./after-sale"

/**
 * 售后卡回寄引导区测试：退货地址只有详情那一份（returnAddress，查询时实时解析），
 * 卡片的两条责任——RETURNING 时把地址/「联系客服」提示给到买家；非待寄回态不硬塞这一块。
 */

function returningTicket(overrides: Partial<TicketResponse> = {}): TicketResponse {
    return {
        ...makeTicket({
            id: crypto.randomUUID(),
            status: "RETURNING",
            type: "RETURN_REFUND",
            availableActions: ["RETURN_GOODS"],
        }),
        ...overrides,
    }
}

describe("AfterSaleCard（回寄引导区）", () => {
    it("待寄回_下发回寄地址_原样展示", () => {
        renderWithProviders(
            <AfterSaleCard
                ticket={returningTicket({
                    returnAddress: "退件员 13800001234 · 浙江省杭州市西湖区文一路 100 号",
                })}
                onAction={vi.fn<(action: AfterSaleAction) => void>()}
            />,
        )

        expect(screen.getByText("退货地址")).toBeInTheDocument()
        expect(
            screen.getByText("退件员 13800001234 · 浙江省杭州市西湖区文一路 100 号"),
        ).toBeInTheDocument()
    })

    it("待寄回_地址为 null_提示联系客服而不是编一个地址", () => {
        renderWithProviders(
            <AfterSaleCard
                ticket={returningTicket({ returnAddress: null })}
                onAction={vi.fn<(action: AfterSaleAction) => void>()}
            />,
        )

        expect(screen.getByText("卖家未设置退货地址，请先联系客服")).toBeInTheDocument()
    })

    it("非待寄回态_不渲染回寄引导区", () => {
        // APPLYING（默认动作只有撤销）：即便详情带了地址也不塞引导区——寄回是 RETURNING 之后才有的事
        renderWithProviders(
            <AfterSaleCard
                ticket={{
                    ...makeTicket({ id: crypto.randomUUID() }),
                    returnAddress: "不该出现的地址",
                }}
                onAction={vi.fn<(action: AfterSaleAction) => void>()}
            />,
        )

        expect(screen.queryByText("退货地址")).not.toBeInTheDocument()
        expect(screen.queryByText("不该出现的地址")).not.toBeInTheDocument()
    })
})

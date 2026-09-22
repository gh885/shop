import { screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { TicketResponse } from "@shop/api/sdk"
import { makeTicket } from "@shop/test-utils"

import { renderWithProviders } from "@shop/app-kit/test"

import { AfterSaleCard } from "./AfterSaleCard"
import type { AfterSaleAction } from "./after-sale"

/**
 * 售后卡回寄引导区与拒绝理由测试：这两块内容都只有详情那一份（returnAddress 查询时实时解析、
 * rejectReason 取自时间线 note），卡片的责任是「下发才渲染、没下发就整行不出现」，不自己编。
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

describe("AfterSaleCard（拒绝理由）", () => {
    it("被拒_下发理由_摆在买家自己那条理由旁边", () => {
        renderWithProviders(
            <AfterSaleCard
                ticket={makeTicket({
                    id: crypto.randomUUID(),
                    status: "REJECTED",
                    availableActions: [],
                    reason: "尺码不合适",
                    rejectReason: "退回商品缺少吊牌，影响二次销售",
                })}
                onAction={vi.fn<(action: AfterSaleAction) => void>()}
            />,
        )

        expect(screen.getByText("拒绝理由")).toBeInTheDocument()
        expect(screen.getByText("退回商品缺少吊牌，影响二次销售")).toBeInTheDocument()
    })

    it("进行中的单_没下发拒绝理由_整行不出现", () => {
        renderWithProviders(
            <AfterSaleCard
                ticket={returningTicket()}
                onAction={vi.fn<(action: AfterSaleAction) => void>()}
            />,
        )

        expect(screen.queryByText("拒绝理由")).not.toBeInTheDocument()
    })
})

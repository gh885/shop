import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { makeSellerTicketItem } from "@shop/test-utils"

import { renderWithProviders } from "#/test/render"

import { refundRowActions, type RefundRowAction } from "./model"
import { RefundTable } from "./refund-table"

/**
 * 工作台表格测试：行内动作必须与售后单状态对齐——「确认收货」绝不能出现在还只是待处理的单上
 * （那等于跳过同意直接退款），「同意」也不该出现在已退款的单上。
 *
 * 纯展示组件：不拉数据、不发请求，直接喂行数据断言按钮与回调。
 */

function renderTable(rows: ReturnType<typeof makeSellerTicketItem>[]) {
    const onAction = vi.fn<(ticket: unknown, action: RefundRowAction) => void>()
    renderWithProviders(
        <RefundTable
            rows={rows}
            page={1}
            pageSize={10}
            total={rows.length}
            onPageChange={vi.fn<(page: number) => void>()}
            onAction={onAction}
        />,
    )
    return { onAction }
}

describe("RefundTable", () => {
    it("待处理的单_只给同意与拒绝，确认收货不出现", async () => {
        renderTable([makeSellerTicketItem({ status: "APPLYING" })])

        expect(screen.getByRole("button", { name: "同意" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "拒绝" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "确认收货" })).not.toBeInTheDocument()
    })

    it("退货中的单_给确认收货并带回该行的售后单标识（不是别行）", async () => {
        const ticket = makeSellerTicketItem({ status: "RETURNING", returnTrackingNo: "SF123456" })
        const { onAction } = renderTable([ticket])

        await userEvent.setup().click(screen.getByRole("button", { name: "确认收货" }))

        expect(onAction).toHaveBeenCalledWith(ticket, "receive")
    })

    it("已退款的行_没有处理动作，给一条「已处理」说明而不是留白", () => {
        renderTable([makeSellerTicketItem({ status: "REFUNDED" })])

        expect(screen.getByText("已处理")).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "同意" })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "拒绝" })).not.toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "确认收货" })).not.toBeInTheDocument()
    })

    it("理由与快递名都为空_如实显示「未填写」与「—」，不画空气", () => {
        renderTable([
            makeSellerTicketItem({ reason: null, refundAmount: null, status: "REJECTED" }),
        ])

        expect(screen.getByText("买家未填写")).toBeInTheDocument()
        expect(screen.getByText("—")).toBeInTheDocument()
    })

    it("每行的动作与它自己的状态一致（多行混排不串位）", () => {
        const applying = makeSellerTicketItem({
            id: "00000000-0000-4000-8000-000000000011",
            status: "APPLYING",
        })
        const returning = makeSellerTicketItem({
            id: "00000000-0000-4000-8000-000000000012",
            status: "RETURNING",
        })

        expect(refundRowActions(applying.status)).toEqual(["agree", "reject"])
        expect(refundRowActions(returning.status)).toEqual(["receive"])
        renderTable([applying, returning])

        // 待处理行两个动作、退货中行一个动作，各自一份（分页按钮不在这个断言范围内）
        expect(screen.getAllByRole("button", { name: "同意" })).toHaveLength(1)
        expect(screen.getAllByRole("button", { name: "拒绝" })).toHaveLength(1)
        expect(screen.getAllByRole("button", { name: "确认收货" })).toHaveLength(1)
    })
})

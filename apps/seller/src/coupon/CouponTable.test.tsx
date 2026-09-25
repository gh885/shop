import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { renderWithProviders } from "@shop/app-kit/test"

import { CouponTable } from "./CouponTable"
import type { CouponRow } from "./model"

/**
 * 券列表行与停券二次确认。
 *
 * 两件容易被"看起来没问题"掩盖的事：进度不能只靠颜色（必须有数字）、
 * 已停用的券按钮必须真的不可点（否则连点两次就是两次停用请求）。
 */

function makeRow(overrides: Partial<CouponRow> = {}): CouponRow {
    return {
        id: "6f1a5b1e-2f3c-4a5d-8e9f-000000000001",
        name: "新春满减券",
        ruleText: "满 ¥100 减 ¥10",
        periodText: "2026-01-01 ~ 2026-02-01",
        issuedQuantity: 30,
        totalQuantity: 100,
        usedQuantity: 12,
        status: "ONGOING",
        statusLabel: "进行中",
        statusVariant: "success",
        createdAt: "2025-12-20T08:00:00Z",
        ...overrides,
    }
}

function renderTable(rows: CouponRow[], onStop = vi.fn<(id: string) => void>()) {
    renderWithProviders(
        <CouponTable
            rows={rows}
            page={1}
            pageSize={10}
            total={rows.length}
            onPageChange={() => undefined}
            onStop={onStop}
        />,
    )
    return { onStop }
}

describe("CouponTable", () => {
    it("已发放进度同时给出数字与进度条，状态文字来自行数据", () => {
        renderTable([makeRow()])

        expect(screen.getByText("已发放 30 / 100")).toBeInTheDocument()
        expect(
            screen.getByRole("progressbar", { name: "新春满减券 已发放 30 / 100" }),
        ).toBeInTheDocument()
        expect(screen.getByText("满 ¥100 减 ¥10")).toBeInTheDocument()
        expect(screen.getByText("进行中")).toBeInTheDocument()
    })

    it("已发放与已核销分开显示：发了多少 ≠ 用掉多少", () => {
        renderTable([makeRow({ issuedQuantity: 30, usedQuantity: 7 })])

        // 只看已发放会以为券很受欢迎；核销数才是「券变成了订单」的那一半
        expect(screen.getByText("已发放 30 / 100")).toBeInTheDocument()
        expect(screen.getByText("已核销 7")).toBeInTheDocument()
    })

    it("已停用的券：按钮显示已停用且不可再点", () => {
        renderTable([
            makeRow({ status: "STOPPED", statusLabel: "已停用", statusVariant: "destructive" }),
        ])

        expect(screen.getByRole("button", { name: "已停用" })).toBeDisabled()
    })

    it("点停用先弹二次确认：说明停发的后果与不可恢复，确认后才回调", async () => {
        const user = userEvent.setup()
        const { onStop } = renderTable([makeRow()])

        await user.click(screen.getByRole("button", { name: "停用" }))

        const dialog = await screen.findByRole("alertdialog")
        expect(within(dialog).getByText(/已领出的券仍然有效/)).toBeInTheDocument()
        expect(within(dialog).getByText(/没有恢复入口/)).toBeInTheDocument()
        expect(onStop).not.toHaveBeenCalled()

        await user.click(within(dialog).getByRole("button", { name: "停用" }))
        expect(onStop).toHaveBeenCalledWith("6f1a5b1e-2f3c-4a5d-8e9f-000000000001")
    })
})

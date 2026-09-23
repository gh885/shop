import type { ShopReviewItem } from "@shop/api/sdk"

import { renderWithProviders } from "@shop/app-kit/test"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DataTable, useDataTable } from "@shop/ui-web"
import { useReviewColumns } from "./columns"

/**
 * 联系电话那一列的接线：后端出参恒为掩码，明文逐条索取且每次留痕（ACC-79）。
 *
 * 钉两点只有页面级才看得见的东西：
 * ① 一屏十行都是「查看」时，可访问名要指得出是哪一家店；
 * ② 索取中只按住发起那一行——别的行还没点，不该跟着变灰。
 */

function item(id: string, shopName: string, ownerPhone: string): ShopReviewItem {
    return {
        id,
        shopId: `shop-${id}`,
        shopName,
        ownerPhone,
        status: "PENDING",
        reason: null,
        decidedAt: null,
        createdAt: "2026-09-23T10:00:00Z",
    }
}

const ROWS: ShopReviewItem[] = [
    item("r1", "海边小店", "138****1234"),
    item("r2", "山间茶室", "138****5678"),
    item("r3", "已核对的店", "13800001234"),
]

function Probe({
    onRevealPhone,
    revealingId,
}: {
    onRevealPhone: (item: ShopReviewItem) => void
    revealingId: string | undefined
}) {
    const columns = useReviewColumns({ onRevealPhone, revealingId })
    const { table } = useDataTable({
        columns,
        data: ROWS,
        getRowId: (row) => row.id,
        enableSorting: false,
    })
    return <DataTable table={table} />
}

describe("审核队列的联系电话列", () => {
    it("掩码行给说得出店名的查看入口，明文行不再给", () => {
        renderWithProviders(
            <Probe
                onRevealPhone={vi.fn<(item: ShopReviewItem) => void>()}
                revealingId={undefined}
            />,
        )

        expect(screen.getByText("已核对的店")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "查看海边小店的号码" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "查看山间茶室的号码" })).toBeInTheDocument()
        expect(screen.queryByRole("button", { name: "查看已核对的店的号码" })).toBeNull()
    })

    it("点查看把整行交回去：请求要的正是这一条的 id", async () => {
        const user = userEvent.setup()
        const onRevealPhone = vi.fn<(item: ShopReviewItem) => void>()
        renderWithProviders(
            <Probe
                onRevealPhone={onRevealPhone}
                revealingId={undefined}
            />,
        )

        await user.click(screen.getByRole("button", { name: "查看山间茶室的号码" }))

        expect(onRevealPhone).toHaveBeenCalledTimes(1)
        expect(onRevealPhone.mock.calls[0]?.[0].id).toBe("r2")
    })

    it("索取中只按住发起那一行，别的行的入口照常可点", () => {
        renderWithProviders(
            <Probe
                onRevealPhone={vi.fn<(item: ShopReviewItem) => void>()}
                revealingId="r1"
            />,
        )

        expect(screen.getByRole("button", { name: "查看海边小店的号码" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "查看山间茶室的号码" })).toBeEnabled()
    })
})

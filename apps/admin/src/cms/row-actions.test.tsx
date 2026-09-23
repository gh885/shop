import type { CmsStatus } from "@shop/api/sdk"

import { renderWithProviders } from "@shop/app-kit/test"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CmsRowActions, type CmsFormDialogProps } from "./row-actions"

/**
 * 行内动作：编辑 + 启停。启停是这个域里唯一「点了前台立刻变」的写操作，
 * 所以值得钉住的是那道二次确认——标题指代哪条、说明了后果、确认才落笔。
 */

type Tab = { id: string; name: string }

function TabDialog({ open, editing }: CmsFormDialogProps<Tab>) {
    return open ? <div>表单：{editing?.name ?? "新增"}</div> : undefined
}

const hints = {
    disable: "停用后前台推荐条立即不再展示该词条，确认执行？",
    enable: "启用后前台推荐条展示该词条，确认执行？",
}

function renderActions({ status = "ENABLED" }: { status?: CmsStatus } = {}) {
    const submit = vi.fn<(status: CmsStatus) => Promise<unknown>>().mockResolvedValue(undefined)
    renderWithProviders(
        <CmsRowActions
            row={{ id: "t1", name: "猜你喜欢" }}
            status={status}
            label="猜你喜欢"
            noun="词条"
            hints={hints}
            pending={false}
            submit={submit}
            Dialog={TabDialog}
        />,
    )
    return { submit }
}

describe("CmsRowActions", () => {
    it("启用中的行给「停用」：二次确认说清后果，确认后才写入 DISABLED", async () => {
        const user = userEvent.setup()
        const { submit } = renderActions({ status: "ENABLED" })

        await user.click(screen.getByRole("button", { name: "停用" }))

        expect(await screen.findByText("停用词条「猜你喜欢」")).toBeTruthy()
        expect(screen.getByText(hints.disable)).toBeTruthy()
        expect(submit).not.toHaveBeenCalled()

        await user.click(screen.getByRole("button", { name: "确认停用" }))

        await waitFor(() => expect(submit).toHaveBeenCalledWith("DISABLED"))
        expect(screen.queryByText("停用词条「猜你喜欢」")).toBeNull()
    })

    it("已停用的行给「启用」：措辞与色调都换向，写入 ENABLED", async () => {
        const user = userEvent.setup()
        const { submit } = renderActions({ status: "DISABLED" })

        await user.click(screen.getByRole("button", { name: "启用" }))

        expect(await screen.findByText("启用词条「猜你喜欢」")).toBeTruthy()
        expect(screen.getByText(hints.enable)).toBeTruthy()

        await user.click(screen.getByRole("button", { name: "确认启用" }))

        await waitFor(() => expect(submit).toHaveBeenCalledWith("ENABLED"))
    })

    it("取消：不写状态，行留在原地", async () => {
        const user = userEvent.setup()
        const { submit } = renderActions({ status: "ENABLED" })

        await user.click(screen.getByRole("button", { name: "停用" }))
        await screen.findByText("停用词条「猜你喜欢」")
        await user.click(screen.getByRole("button", { name: "取消" }))

        expect(submit).not.toHaveBeenCalled()
        expect(screen.queryByText("停用词条「猜你喜欢」")).toBeNull()
    })

    it("编辑：打开本域的对话框并把整行交给它回填", async () => {
        const user = userEvent.setup()
        renderActions()

        await user.click(screen.getByRole("button", { name: "编辑" }))

        expect(await screen.findByText("表单：猜你喜欢")).toBeTruthy()
    })
})

import { Link } from "@tanstack/react-router"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vite-plus/test"

import { renderWithRouter } from "../test"
import { useUnsavedLeaveGuard } from "./use-unsaved-leave"

/**
 * 守的是「脏 → 离开要确认，确认才真走」这条链路：`useBlocker` 的 resolver 接线、命令式
 * confirm 的渲染宿主、`onLeave` 回调，断一环就变成「点了没反应」或「没确认就走」。
 * 不干净时不拦（每次跳转都弹一道是灾难）也在这里。
 * 文案与按钮名一起钉：调用页（发品第二步 / 运费模板）共用同一份措辞。
 */
function GuardedProbe({ onLeave }: { onLeave: () => void }) {
    const [dirty, setDirty] = useState(false)
    useUnsavedLeaveGuard(() => dirty, { onLeave })
    return (
        <>
            <button
                type="button"
                onClick={() => setDirty(true)}
            >
                改点什么
            </button>
            <Link to="/elsewhere">去别处</Link>
        </>
    )
}

describe("useUnsavedLeaveGuard", () => {
    it("干净时直接放行；脏了才弹确认，取消留在原页", async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn<() => void>()
        const { router } = renderWithRouter(<GuardedProbe onLeave={onLeave} />)

        await user.click(await screen.findByRole("link", { name: "去别处" }))
        await waitFor(() => expect(router.state.location.pathname).toBe("/elsewhere"))
        expect(screen.queryByText("有未保存的更改")).not.toBeInTheDocument()

        await router.navigate({ to: "/" })
        await user.click(screen.getByRole("button", { name: "改点什么" }))
        await user.click(screen.getByRole("link", { name: "去别处" }))

        expect(await screen.findByText("有未保存的更改")).toBeInTheDocument()
        await user.click(screen.getByRole("button", { name: "继续编辑" }))
        expect(screen.queryByText("有未保存的更改")).not.toBeInTheDocument()
        expect(router.state.location.pathname).toBe("/")
        expect(onLeave).not.toHaveBeenCalled()
    })

    it("确认放弃才换页，并回调 onLeave 让调用方复位脏标记", async () => {
        const user = userEvent.setup()
        const onLeave = vi.fn<() => void>()
        const { router } = renderWithRouter(<GuardedProbe onLeave={onLeave} />)

        await user.click(await screen.findByRole("button", { name: "改点什么" }))
        await user.click(screen.getByRole("link", { name: "去别处" }))
        await screen.findByText("有未保存的更改")
        await user.click(screen.getByRole("button", { name: "放弃修改" }))

        await waitFor(() => expect(router.state.location.pathname).toBe("/elsewhere"))
        expect(onLeave).toHaveBeenCalledTimes(1)
    })
})

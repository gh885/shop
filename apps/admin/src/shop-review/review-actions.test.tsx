import type { ShopReviewItem } from "@shop/api/sdk"

import { renderWithProviders } from "@shop/app-kit/test"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { server } from "@shop/test-utils"
import { ReviewActions } from "./review-actions"

/**
 * 审核一行的两个决定：通过（二次确认后落库）与驳回（必须写理由）。
 *
 * 钉三件事：① 「通过」不点第二下确认就不该发出请求——这一按下去店铺就上线了；
 * ② 空理由被表单拦住，不该变成一次打到后端的 400；
 * ③ 两个决定互斥：一个在处理中时另一颗按住，否则通过和驳回可以同时落库，后写的覆盖前一个结论。
 */

const ITEM: ShopReviewItem = {
    id: "00000000-0000-4000-8000-0000000000bb",
    shopId: "00000000-0000-4000-8000-0000000000aa",
    shopName: "海边小店",
    ownerPhone: "138****1234",
    status: "PENDING",
    reason: null,
    decidedAt: null,
    createdAt: "2026-09-23T10:00:00Z",
}

/** `hold`：决定请求挂起直到调用 `calls.release()`——「在途」由测试说了算，不赌定时器（全量并行下 60ms 会先跑完） */
function useReviewRoutes({ hold = false }: { hold?: boolean } = {}) {
    let release!: () => void
    const gate = hold ? new Promise<void>((resolve) => (release = resolve)) : undefined
    const calls = { approve: 0, rejectedWith: [] as string[], release: () => release() }
    const decided = (status: "APPROVED" | "REJECTED") => ({
        id: ITEM.id,
        shopId: ITEM.shopId,
        staffId: "00000000-0000-4000-8000-0000000000ff",
        status,
        reason: status === "REJECTED" ? "营业执照信息与店铺主体不一致" : null,
        decidedAt: "2026-09-23T11:00:00Z",
        createdAt: ITEM.createdAt,
        updatedAt: "2026-09-23T11:00:00Z",
    })
    server.use(
        http.post("*/admin/reviews/:id/approve", async () => {
            calls.approve += 1
            await gate
            return HttpResponse.json(decided("APPROVED"))
        }),
        http.post("*/admin/reviews/:id/reject", async ({ request }) => {
            const body: unknown = await request.json()
            const reason =
                body && typeof body === "object" ? Reflect.get(body, "reason") : undefined
            calls.rejectedWith.push(typeof reason === "string" ? reason : "")
            await gate
            return HttpResponse.json(decided("REJECTED"))
        }),
    )
    return calls
}

function renderActions() {
    renderWithProviders(<ReviewActions item={ITEM} />)
    return userEvent.setup()
}

describe("ReviewActions", () => {
    it("通过：先二次确认，确认这一步才把请求发出去", async () => {
        const user = renderActions()
        const calls = useReviewRoutes()

        await user.click(screen.getByRole("button", { name: "通过" }))
        expect(await screen.findByText("通过「海边小店」的开店申请")).toBeTruthy()
        expect(calls.approve).toBe(0)

        await user.click(screen.getByRole("button", { name: "确认通过" }))
        await waitFor(() => expect(calls.approve).toBe(1))
    })

    it("驳回：空理由被表单拦住，填了才带着理由提交", async () => {
        const user = renderActions()
        const calls = useReviewRoutes()

        await user.click(screen.getByRole("button", { name: "驳回" }))
        const reason = await screen.findByRole("textbox", { name: "驳回理由" })
        await user.click(screen.getByRole("button", { name: "确认驳回" }))

        expect(await screen.findByText("请填写驳回理由")).toBeTruthy()
        expect(calls.rejectedWith).toEqual([])

        await user.type(reason, "营业执照信息与店铺主体不一致")
        await user.click(screen.getByRole("button", { name: "确认驳回" }))

        await waitFor(() => expect(calls.rejectedWith).toEqual(["营业执照信息与店铺主体不一致"]))
    })

    it("处理中：另一颗决定按住，通过和驳回不会同时落库", async () => {
        const user = renderActions()
        const calls = useReviewRoutes({ hold: true })

        await user.click(screen.getByRole("button", { name: "通过" }))
        await user.click(screen.getByRole("button", { name: "确认通过" }))

        // 请求在途时确认面还开着，整行对读屏是 inert 的：要 hidden: true 才查得到那颗按钮
        const reject = screen.getByRole("button", { name: "驳回", hidden: true })
        expect(reject).toBeDisabled()
        await user.click(reject)
        calls.release()

        await waitFor(() => expect(calls.approve).toBe(1))
        expect(calls.rejectedWith).toEqual([])
        expect(screen.queryByRole("textbox", { name: "驳回理由" })).toBeNull()
    })
})

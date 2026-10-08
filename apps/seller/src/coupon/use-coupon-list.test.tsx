import { act, renderHook, waitFor } from "@testing-library/react"
import { delay, HttpResponse, http } from "msw"
import { describe, expect, it } from "vite-plus/test"

import { makeCouponTemplate, server } from "@shop/test-utils"
import { createAppTestHookClient } from "@shop/app-kit/test"

import { useCouponList } from "./use-coupon-list"

/**
 * 券列表视图模型的接线：行是「相对此刻」派生出来的，停券打在这张券上并让列表重拉。
 *
 * 断言走真实 QueryClient（`createAppTestHookClient`）：失效由全局 MutationCache 执行，
 * 用裸 client 就测不到「停完这张券，列表自己换成已停用」——那正是卖家点完之后唯一能看见的反馈。
 */

const SHOP_ID = "00000000-0000-4000-8000-0000000000aa"
const COUPON_ID = "6f1a5b1e-2f3c-4a5d-8e9f-000000000001"

/** 有效期还没到的模板：wire 里是 ACTIVE，页面上必须说「未开始」 */
function futureTemplate() {
    return makeCouponTemplate({
        id: COUPON_ID,
        validFrom: new Date(Date.now() + 86_400_000).toISOString(),
        validTo: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    })
}

/** 列表被拉了几次 + 停用请求打在哪张券上 */
function useCouponRoutes(stopDelayMs = 0) {
    const calls = { list: 0, stoppedOn: undefined as string | undefined }
    server.use(
        http.get("*/seller/coupons", () => {
            calls.list += 1
            return HttpResponse.json({ records: [futureTemplate()], total: 1 })
        }),
        http.put("*/seller/coupons/:id/stop", async ({ params }) => {
            calls.stoppedOn = String(params.id)
            if (stopDelayMs) await delay(stopDelayMs)
            return HttpResponse.json(
                makeCouponTemplate({ id: String(params.id), status: "STOPPED" }),
            )
        }),
    )
    return calls
}

async function setup(stopDelayMs = 0) {
    const calls = useCouponRoutes(stopDelayMs)
    const { wrapper } = createAppTestHookClient()
    const list = renderHook(() => useCouponList(SHOP_ID, { page: 1, size: 10 }), { wrapper })
    await waitFor(() => expect(list.result.current.rows).toHaveLength(1))
    return { ...list, calls }
}

describe("券列表的展示状态", () => {
    it("还没到有效期的模板算未开始，不是照抄 wire 的 ACTIVE", async () => {
        const { result } = await setup()
        const [row] = result.current.rows

        expect(row?.status).toBe("NOT_STARTED")
        expect(row?.statusLabelKey).toBe("coupon.status.NOT_STARTED")
        expect(result.current.total).toBe(1)
    })
})

describe("券列表的停券", () => {
    it("停用请求打在这张券上，处理中该行记为 busyId，成功后列表重拉", async () => {
        const { result, calls } = await setup(50)
        expect(calls.list).toBe(1)

        // 花括号丢掉返回值：run 现在把动作 promise 透出给「要按结果收尾」的弹窗调用点，
        // 而 act 一旦拿到 thenable 会把整条链冲完——busyId 断言（处理中）就抢不到了
        act(() => {
            void result.current.stop(COUPON_ID)
        })
        // 请求没回来前这一行是忙碌态：表格据此禁用按钮，防连点出两条停用
        expect(result.current.busyId).toBe(COUPON_ID)
        await waitFor(() => expect(calls.stoppedOn).toBe(COUPON_ID))

        await waitFor(() => expect(result.current.busyId).toBeUndefined())
        await waitFor(() => expect(calls.list).toBe(2))
    })
})

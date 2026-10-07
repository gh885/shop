import setup from "../globalSetup"
import { API_URL } from "../fixtures/env"
import { localOrigin } from "../../perf/scenarios.mjs"

export default async function setupPerformance(): Promise<void> {
    localOrigin(API_URL)
    const response = await fetch(API_URL + "/v3/api-docs", {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
    })
    if (!response.ok) throw new Error("Performance fixture backend is unavailable")
    // 与业务 E2E 共用造数：每轮独立账号、商品与订单，不依赖演示库残留。
    await setup()
}

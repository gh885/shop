import { describe, expect, it } from "vite-plus/test"

import { ORDER_ACTION_ORDER, ORDER_PROGRESS_STEP_COUNT } from "./constants"
import { ORDER_ACTION_KEY } from "./order-label"

describe("展示辅助", () => {
    it("进度条固定四格：下单 → 付款 → 发货 → 收货", () => {
        expect(ORDER_PROGRESS_STEP_COUNT).toBe(4)
    })

    it("展示顺序表覆盖全部动作：漏登记的动作用户根本看不见", () => {
        expect([...ORDER_ACTION_ORDER].toSorted()).toEqual(Object.keys(ORDER_ACTION_KEY).toSorted())
    })
})

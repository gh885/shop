import { describe, expect, it } from "vite-plus/test"

import { ORDER_ACTION_ORDER, ORDER_PROGRESS_STEP, ORDER_PROGRESS_STEP_COUNT } from "./constants"
import { ORDER_ACTION_KEY } from "./order-label"

describe("展示辅助", () => {
    it("取消态不进入进度条（step -1），完成态停在最后一步", () => {
        expect(ORDER_PROGRESS_STEP.cancelled).toBe(-1)
        expect(ORDER_PROGRESS_STEP.completed).toBe(ORDER_PROGRESS_STEP_COUNT - 1)
    })

    it("展示顺序表覆盖全部动作_漏登记的动作用户根本看不见", () => {
        expect([...ORDER_ACTION_ORDER].toSorted()).toEqual(Object.keys(ORDER_ACTION_KEY).toSorted())
    })
})

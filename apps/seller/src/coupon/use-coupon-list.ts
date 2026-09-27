import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { useRowBusy } from "#/shared/lib/use-row-busy"
import { couponRowFromWire, type CouponListSearch } from "./model"
import { couponListOptions, useStopCoupon } from "./queries"

/**
 * 券列表的视图模型：query + 停券 mutation + 行内忙碌态合成一个口给页面用。
 *
 * 「现在」在展示状态里是一条输入（未开始 / 进行中 / 已结束 是相对此刻判的），
 * 所以一次挂载只取一个时刻，避免同一屏里各行跨秒判定不一致。取值走 useState 惰性初始化
 * 而不是在渲染里直接调 Date.now()：渲染必须是纯的（react/purity）。
 */
export function useCouponList(shopId: string, search: CouponListSearch) {
    const coupons = useQuery(couponListOptions(shopId, search))
    const stop = useStopCoupon(shopId)
    const { busyId, run } = useRowBusy()
    const [now] = useState(() => Date.now())

    return {
        rows: (coupons.data?.records ?? []).map((template) => couponRowFromWire(template, now)),
        total: coupons.data?.total ?? 0,
        isPending: coupons.isLoading,
        busyId,
        stop: (id: string) => run(stop.mutateAsync)(id),
    }
}

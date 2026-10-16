import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { useI18n } from "@shop/app-kit/i18n"
import { useRowBusy } from "#/shared/lib/use-row-busy"
import { couponRowFromWire } from "./mapper"
import { couponListOptions, useStopCoupon, type CouponListSearch } from "./queries"

// now 一次挂载只取一个时刻（useState 惰性初始化）：写成 const now = Date.now() 渲染不纯，同屏各行跨秒判定还会不一致
export function useCouponList(shopId: string, search: CouponListSearch) {
    const coupons = useQuery(couponListOptions(shopId, search))
    const stop = useStopCoupon(shopId)
    const { busyId, run } = useRowBusy()
    const { locale } = useI18n()
    const [now] = useState(() => Date.now())

    return {
        rows: (coupons.data?.records ?? []).map((template) =>
            couponRowFromWire(template, now, locale),
        ),
        // total 别折成 ?? 0：undefined（还没到手）与 0（真没券）是两件事，页面分页收口靠这个区分
        total: coupons.data?.total,
        isPending: coupons.isPending,
        busyId,
        stop: (id: string) => run(stop.mutateAsync)(id),
    }
}

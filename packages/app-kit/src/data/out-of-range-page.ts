import { useEffect, useRef } from "react"

/** 越界页码收口：total 只有数据到手后才存在，修正必须挂在数据上判——删除回调里猜有竞态且只覆盖一条收缩路径，判据用权威 total 不用「数组空不空」代理信号 */

/**
 * 越界时返回应回到的页码，合法返回 `undefined`——无脑兜一个页码会让每次数据变化都写一次 URL，甚至成环
 *
 * `Math.max(1, …)` 兜住空列表：totalPages 为 0 时回第 1 页，而不是 `?page=0`
 */
export function outOfRangePage(page: number, totalPages: number): number | undefined {
    if (page <= totalPages) return undefined
    return Math.max(1, totalPages)
}

/** 总页数；total 未到手返回 0 = 「还不知道」，调用方据此跳过判定（防拿旧 total 钳新页） */
export function pageCount(total: number | undefined, size: number): number {
    if (total === undefined || size <= 0) return 0
    return Math.max(1, Math.ceil(total / size))
}

/**
 * 数据落定后的收口：算总页数 → 判越界 → 经 onFix 回调写回（不 import 路由，与「域内组件不 import 路由」同一条边界）
 *
 * 修正必须 `replace` 写回：进历史栈后退回到空页又被弹回，死循环
 */
export function useOutOfRangePageGuard({
    page,
    total,
    size,
    onFix,
}: {
    page: number
    total: number | undefined
    size: number
    onFix: (page: number) => void
}): void {
    // onFix 走 ref：调用点多是内联箭头，进依赖会让效果每帧重跑、反复导航
    const fixRef = useRef(onFix)
    useEffect(() => {
        fixRef.current = onFix
    })

    const totalPages = pageCount(total, size)
    useEffect(() => {
        if (total === undefined) return
        const fixed = outOfRangePage(page, totalPages)
        if (fixed !== undefined) fixRef.current(fixed)
    }, [total, page, totalPages])
}

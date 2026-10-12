import { useEffect, useRef } from "react"

/**
 * 越界页码收口 —— 分页列表在数据到达后发现「当前页码已经不成立」时的修正。
 *
 * ## 为什么需要
 * 页码不是一个独立状态，它是区间 `[1, totalPages]` 里的一个值，而 `totalPages = ceil(total / size)`
 * 里的 `total` 只有服务端知道 —— **数据回来之后才存在**。于是删掉末页最后一条、下架筛选里的
 * 那唯一一条、或者点开一个陈旧的 `?page=99` 分享链接，都会让「当前页」落在一个已经不存在的
 * 页上：接口老老实实返回空数组，页面显示「暂无数据」，而列表其实还有内容。
 *
 * ## 为什么只能挂在数据上
 * - **不能在「删除成功」的回调里猜**（`if (删的是本页最后一条) setPage(page - 1)`）：那要先读缓存判
 *   「删之前本页是不是只剩一条」，与 refetch 有竞态；而且只覆盖「删除」这一条收缩路径 ——
 *   筛选变化、排序变化、别人删了、旧链接，一个都不管。
 * - **不能在数据到达前判**：拿上一轮的旧 `total` 去钳新页，会在翻页的瞬间把合法页误判成越界。
 *
 * 挂在**数据**上，任何让列表收缩的原因都自动覆盖，且判据用的是权威 `total`，不是「数组空不空」
 * 这个代理信号（后者在「筛选后本就该为空」时会产生歧义）。
 *
 * 社区没有现成封装可抄：表格组件不知道你的 total 从哪来，URL 状态库只管序列化，
 * 数据层只管取数缓存 —— 只有应用层同时握着「页码」与「服务端返回的 total」。所以这一层必须自己写，
 * 写在这里（而不是各页各抄一遍）就是它存在的理由。
 */

/**
 * 纯判据：页码越界时返回应回到的页码，合法时返回 `undefined`。
 *
 * 返回 `undefined`（而不是兜底给一个页码）是整条链自洽的关键 —— 调用方据此只在**真的**越界时
 * 导航；无脑返回一个页码会让每次数据变化都写一次 URL，造出无谓导航甚至循环。
 *
 * `Math.max(1, …)` 兜住空列表：`totalPages` 是 0 时回到第 1 页，而不是 `?page=0`
 * （那会被 search schema 的 `.catch(1)` 再兜一次，白绕一圈）。
 */
export function outOfRangePage(page: number, totalPages: number): number | undefined {
    if (page <= totalPages) return undefined
    return Math.max(1, totalPages)
}

/**
 * 列表总数 + 每页条数 → 总页数。
 *
 * 总数未知（还没到手）时返回 0，调用方据此**跳过判定** —— 这正是「不拿旧 total 钳新页」那条
 * 纪律的落点：`0` 在这里不是「一页都没有」，是「还不知道」。
 */
export function pageCount(total: number | undefined, size: number): number {
    if (total === undefined || size <= 0) return 0
    return Math.max(1, Math.ceil(total / size))
}

/**
 * 数据落定后的越界收口：把「算总页数 → 判越界 → 修正页码」三步收成一个调用。
 *
 * 调用方只给「页码 / 总数 / 每页几条」与「怎么把修正写回 URL」（`onFix`）—— 后者是路由相关的，
 * 收成回调而不是让这里 import 路由，与「域内组件不 import 路由」是同一条边界。
 *
 * **修正必须用 `replace` 写回**（不进历史栈）：页码修正是擦掉一个错误状态，不是用户走了一步；
 * 进了历史栈，后退就会回到那个空页、然后又被弹回，形成死循环。
 */
export function useOutOfRangePageGuard({
    page,
    total,
    size,
    onFix,
}: {
    /** 当前页码（URL 真源） */
    page: number
    /** 服务端返回的总数；还没到手传 `undefined` —— 此时不判定 */
    total: number | undefined
    /** 每页条数 */
    size: number
    /** 修正动作：把修正后的页码写回 URL（应带 `replace: true`） */
    onFix: (page: number) => void
}): void {
    // onFix 走 ref，效果只由「页码 + 数据」驱动。调用点通常传内联箭头，把它放进依赖会让效果
    // 每次渲染都重跑 —— 修正本身幂等（修完 page 就合法了）不至于死循环，但「页码输入没跟着 URL 走」
    // 的调用方（如把 search 当常量 prop 传的测试探针）会被反复导航，白跑且噪声大。
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

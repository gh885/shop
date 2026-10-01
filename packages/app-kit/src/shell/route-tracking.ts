/**
 * PV 上报的三端同一份接线。
 *
 * 放这里而不是各 app 的 router.tsx / main.tsx 各写一遍：PV 的模板化口径必须三端一致
 * （同一个页面在两个端上报出两个 route 串，按 route 聚合时就会裂成两条线），
 * 而「抄三份」正是口径漂移的标准成因。
 *
 * 为什么挂在 `onResolved` 而不是 `onLoad` / `onBeforeNavigate`：那两者在导航**开始**时触发，
 * 而导航可能失败（守卫拦截、loader 抛错）——那种情况根本没有「这个页面被展示了」这回事，
 * 计入 PV 就是把没打开的页面算成打开，分母偏大、错误率被算低。
 */
import type { AnyRouter } from "@tanstack/react-router"

import { trackRoute } from "@shop/common/monitoring" /**
 * 订阅路由变化上报 PV。返回退订函数（组件里挂 useEffect 时要用）。
 *
 * 参数从 `router.state.matches` 的最后一条取，而不是从事件上取：`onResolved` 的
 * `NavigationEventInfo` 只有 location，没有 route match，拿不到 `$orderId` 这类参数名
 * （拿不到参数名就只能退化成 `$id`，模板化的可读性与可聚合性一起下降）。
 */
export function trackRouteResolved(router: AnyRouter): () => void {
    return router.subscribe("onResolved", (event) => {
        const matches = router.state.matches
        const last = matches[matches.length - 1]
        // 传带参数值的 pathname，模板化由 common 的出口做——业务侧不手拼 $ 串
        trackRoute(event.toLocation.pathname, (last?.params ?? {}) as Record<string, string>)
    })
}

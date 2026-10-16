/**
 * PV 上报三端共用一份接线：模板化口径必须一致，抄三份正是漂移的标准成因。
 * 挂 onResolved 而非 onLoad/onBeforeNavigate：后两者在导航开始时触发，导航可能失败（守卫拦截、loader 抛错），计入会污染分母、压低错误率。
 */
import type { AnyRouter } from "@tanstack/react-router"

import { trackRoute } from "@shop/monitoring"

/** 末条 match 才有参数名（onResolved 事件只带 location）；参数名退化会让模板化无法聚合 */
export function trackRouteResolved(router: AnyRouter): () => void {
    return router.subscribe("onResolved", (event) => {
        const matches = router.state.matches
        const last = matches.at(-1)
        trackRoute(event.toLocation.pathname, (last?.params ?? {}) as Record<string, string>)
    })
}

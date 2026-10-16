import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(callback: () => void) {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
}

const getSnapshot = () => window.innerWidth < MOBILE_BREAKPOINT
// 服务端快照恒 false（桌面布局），挂载后由 store 机制切真实值——不像 useState 惰性初始化那样造成 SSR 与客户端首帧渲染不一致
const getServerSnapshot = () => false

export function useIsMobile() {
    return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

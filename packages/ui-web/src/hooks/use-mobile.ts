import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
    // SSR 安全：服务端渲染时没有 window，先给 false（桌面布局），客户端首次渲染再取真实值。
    // 不能用 useEffect 里二次校正——那会造成 SSR 输出与客户端首帧不一致的闪烁。
    const [isMobile, setIsMobile] = React.useState(
        () => typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT,
    )

    React.useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
        const onChange = () => {
            setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
        }
        mql.addEventListener("change", onChange)
        return () => mql.removeEventListener("change", onChange)
    }, [])

    return isMobile
}

import * as React from "react"

function useLazyRef<T>(fn: () => T) {
    // useState 惰性初始化替代「渲染期写 ref.current」：fn 只首帧跑一次，返回的 ref 跨渲染稳定（useRef 会忽略首帧后的实参）
    const [value] = React.useState(fn)
    return React.useRef(value)
}

export { useLazyRef }

import * as React from "react"

function useLazyRef<T>(fn: () => T) {
    // useState 惰性初始化替代「渲染期写 ref.current」：fn 只在首帧执行一次，
    // 返回的 ref 对象跨渲染稳定（useRef 首帧之后的实参被忽略）。
    const [value] = React.useState(fn)
    return React.useRef(value)
}

export { useLazyRef }

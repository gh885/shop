import * as React from "react"
import { useBlocker } from "@tanstack/react-router"

import { confirm } from "@shop/ui-web"

/**
 * 「有未保存更改，离开前确认」守卫 —— 路由内跳转 + 关页/刷新一次接好。
 *
 * 是官方 `useBlocker` 的组合而非替代：`shouldBlockFn` 拦路由内跳转（`withResolver` 拿到
 * proceed/reset），`enableBeforeUnload` 交给库自己处理关页/刷新（不传它会恒拦——干净状态
 * 刷新也弹浏览器提示，所以这里必须跟脏判定绑定）。blocked 时弹命令式 `confirm()`，
 * 确认即放行并回调 `onLeave`（调用方复位自己的脏标记），取消则 `reset()` 回原路径。
 *
 * 需要根布局挂 `<ConfirmDialogHost />`（seller/admin 的 __root 已挂）。
 *
 * @param when 脏判定；每次将要离开时求值（传箭头函数，不要传渲染期快照）
 * @param opts.beforeUnload 是否也拦关页/刷新，默认 `true`
 * @param opts.onLeave 用户确认离开后回调（如复位本地 dirty 状态）
 */
interface UnsavedLeaveOptions {
    beforeUnload?: boolean
    onLeave?: () => void
}

export function useUnsavedLeaveGuard(when: () => boolean, opts: UnsavedLeaveOptions = {}): void {
    const { beforeUnload = true, onLeave } = opts
    const blocker = useBlocker({
        shouldBlockFn: when,
        enableBeforeUnload: beforeUnload ? when : false,
        withResolver: true,
    })

    // onLeave 不进依赖：它是调用点的箭头函数，每次渲染换身份会把确认面重复弹开；
    // 用 ref 取最新值（渲染期写 ref 被 react/refs 禁，所以放在 effect 里）
    const onLeaveRef = React.useRef(onLeave)
    React.useEffect(() => {
        onLeaveRef.current = onLeave
    })

    React.useEffect(() => {
        if (blocker.status !== "blocked") return
        // 在 narrowed 作用域里取出：blocked 形态下 proceed/reset 必有
        const { proceed, reset } = blocker
        let alive = true
        async function ask(): Promise<void> {
            const go = await confirm({
                title: "有未保存的更改",
                description: "离开后当前页面的修改将丢失，确定要离开吗？",
                cancelText: "继续编辑",
                confirmText: "放弃修改",
                tone: "destructive",
            })
            if (!alive) return
            if (go) {
                onLeaveRef.current?.()
                proceed()
            } else {
                reset()
            }
        }
        void ask()
        return () => {
            alive = false
        }
    }, [blocker])
}

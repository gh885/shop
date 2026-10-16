import * as React from "react"
import { useBlocker } from "@tanstack/react-router"

import { confirm } from "@shop/ui-web"

import { useT } from "../i18n"

/**
 * 脏表单离开确认：官方 useBlocker 组合（shouldBlockFn 拦路由内跳转，enableBeforeUnload 必须绑脏判定否则干净刷新也恒拦），blocked 时弹命令式 confirm，确认放行回调 onLeave、取消 reset
 * 需根布局挂 <ConfirmDialogHost />（seller/admin 的 __root 已挂）；when 传箭头函数不要传渲染期快照
 */
interface UnsavedLeaveOptions {
    beforeUnload?: boolean
    onLeave?: () => void
}

export function useUnsavedLeaveGuard(when: () => boolean, opts: UnsavedLeaveOptions = {}): void {
    const { beforeUnload = true, onLeave } = opts
    const t = useT()
    const blocker = useBlocker({
        shouldBlockFn: when,
        enableBeforeUnload: beforeUnload ? when : false,
        withResolver: true,
    })

    // onLeave 不进依赖：它是调用点的箭头函数，每次渲染换身份会把确认面重复弹开；
    // 用 ref 取最新值（渲染期写 ref 被 react/refs 禁，所以放在 effect 里）
    const onLeaveRef = React.useRef(onLeave)
    // t 同理：切语言会让 t 换身份，进依赖会在已弹出的确认面上重复弹一次；弹时用 ref 现读当前语言
    const tRef = React.useRef(t)
    React.useEffect(() => {
        onLeaveRef.current = onLeave
        tRef.current = t
    })

    React.useEffect(() => {
        if (blocker.status !== "blocked") return
        // 在 narrowed 作用域里取出：blocked 形态下 proceed/reset 必有
        const { proceed, reset } = blocker
        let alive = true
        async function ask(): Promise<void> {
            const translate = tRef.current
            const go = await confirm({
                title: translate("unsavedLeave.title"),
                description: translate("unsavedLeave.description"),
                cancelText: translate("unsavedLeave.cancel"),
                confirmText: translate("unsavedLeave.confirm"),
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

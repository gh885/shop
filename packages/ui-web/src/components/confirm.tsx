import * as React from "react"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "./ui/alert-dialog"
import { Spinner } from "./ui/spinner"
import { useUiLabels } from "./ui-labels"

export interface ConfirmOptions {
    title: string
    /** 说明文案；需要展示具体对象名（订单号/地址…）时传节点 */
    description?: React.ReactNode
    /** 确认按钮文案，默认「确定」 */
    confirmText?: string
    cancelText?: string
    /** destructive = 不可逆操作（删除/下架/取消订单），默认 destructive */
    tone?: "destructive" | "default"
    /**
     * 确认动作：promise 期间按钮禁用并转 Spinner；resolve 后关窗（confirm 兑现 true），
     * reject 时窗口保持打开等用户重试或放弃（错误 toast 归全局 mutation 反馈，这里不重复弹）。
     * 不传则点击确认立即关窗兑现 true。
     */
    action?: () => Promise<unknown>
}

interface ActiveConfirm {
    /** 每次 confirm() 递增：作为确认面的 key，让新的确认重置上一面的本地态（busy） */
    id: number
    options: ConfirmOptions
    done: (value: boolean) => void
}

let active: ActiveConfirm | undefined
let seq = 0
const hostListeners = new Set<(request: ActiveConfirm | undefined) => void>()

function publish() {
    for (const listener of hostListeners) listener(active)
}

function closeActive(value: boolean) {
    const finishing = active
    if (!finishing) return
    active = undefined
    publish()
    finishing.done(value)
}

/**
 * 命令式二次确认：`const ok = await confirm({ title, description, action })`。
 *
 * 与 notify 同级的全局收口：调用点只声明意图，不再各自持有 open state 与弹窗骨架。
 * 需要根布局挂 `<ConfirmDialogHost />`（与 <Toaster /> 并排）。只允许在客户端事件回调里调，
 * 不要在渲染期/SSR 阶段调用。同一时刻只有一个确认面：新的会接管（旧的按取消兑现）。
 */
function confirm(options: ConfirmOptions): Promise<boolean> {
    if (active) closeActive(false)
    let done!: (value: boolean) => void
    const promise = new Promise<boolean>((resolve) => {
        done = resolve
    })
    active = { id: ++seq, options, done }
    publish()
    return promise
}

function ConfirmDialogSurface({ options }: { options: ConfirmOptions }) {
    // 通用按钮文案在渲染期从 context 取（切语言随 UiLabelsProvider 的 value 当场变）。
    // confirm() 是命令式 API，但弹窗本身是组件，所以这条文案不必绕模块级单例。
    const labels = useUiLabels().confirm
    const [busy, setBusy] = React.useState(false)

    async function handleConfirm() {
        if (!options.action) {
            closeActive(true)
            return
        }
        setBusy(true)
        try {
            await options.action()
            closeActive(true)
        } catch {
            // 失败保持打开：错误提示已由全局 mutation 反馈弹出，用户可重试或取消
        } finally {
            setBusy(false)
        }
    }

    return (
        <AlertDialog
            open
            onOpenChange={(next) => {
                if (!next && !busy) closeActive(false)
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{options.title}</AlertDialogTitle>
                    {options.description === undefined ? undefined : (
                        <AlertDialogDescription>{options.description}</AlertDialogDescription>
                    )}
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>
                        {options.cancelText ?? labels.cancel}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        variant={options.tone === "default" ? undefined : "destructive"}
                        disabled={busy}
                        onClick={handleConfirm}
                    >
                        {busy ? <Spinner /> : undefined}
                        {options.confirmText ?? labels.confirm}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

/** 全局确认弹窗挂载层：放在根布局（与 <Toaster /> 并排），全站一个 */
function ConfirmDialogHost() {
    // 初值直接读模块状态：Host 比第一次 confirm() 晚挂载时（懒挂载的路由边界）也能补上面
    const [request, setRequest] = React.useState(active)
    React.useEffect(() => {
        hostListeners.add(setRequest)
        return () => {
            hostListeners.delete(setRequest)
        }
    }, [])

    if (!request) return undefined
    return (
        <ConfirmDialogSurface
            key={request.id}
            options={request.options}
        />
    )
}

export { confirm, ConfirmDialogHost }

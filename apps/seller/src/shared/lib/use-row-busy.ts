import { useEffect, useRef, useState } from "react"

/**
 * useRowBusy —— 列表行内动作的「正在处理哪一行」状态。
 *
 * 行级按钮（下架/发货/设为默认…）点击后要禁用本行并防重复提交：
 * 记录 busyId，动作结束复位。返回的 promise **把失败原样透出**——拿着它的调用点
 * （发货弹窗、售后决策弹窗）要按结果决定「失败不关窗、422 落框」；不拿返回值的
 * 发射即忘调用点由内部一条兜底分支吞掉 rejection，维持「不产生 unhandled rejection
 * 噪声」的原契约（错误提示本就由全局写操作反馈 toast 承担）。
 * React Compiler 已接管缓存：返回的 run 不必手动 memo。
 */
export function useRowBusy() {
    const [busyId, setBusyId] = useState<string | undefined>()
    const activeRun = useRef<symbol | undefined>(undefined)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    /** 包一层：返回「传行 id 就能执行」的函数，自动维护 busyId；promise 带出动作的结果 */
    function run(action: (id: string) => Promise<unknown>) {
        return (id: string) => {
            const runId = Symbol(id)
            activeRun.current = runId
            setBusyId(id)
            const done = Promise.resolve().then(() => action(id))
            // 兜底分支只消掉「没人接的 rejection」；busy 复位挂在这条链上，
            // 与调用点接不接结果无关
            done.catch(() => undefined).finally(() => {
                if (mounted.current && activeRun.current === runId) {
                    activeRun.current = undefined
                    setBusyId(undefined)
                }
            })
            return done
        }
    }

    return { busyId, run }
}

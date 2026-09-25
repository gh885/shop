import { useEffect, useRef, useState } from "react"

/**
 * useRowBusy —— 列表行内动作的「正在处理哪一行」状态。
 *
 * 行级按钮（下架/发货/设为默认…）点击后要禁用本行并防重复提交：
 * 记录 busyId，动作结束复位；错误已在 mutation 里 toast，这里只吞掉 unhandled rejection。
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

    /** 包一层：返回「传行 id 就能执行」的函数，自动维护 busyId */
    function run(action: (id: string) => Promise<unknown>) {
        return (id: string) => {
            const runId = Symbol(id)
            activeRun.current = runId
            setBusyId(id)
            void Promise.resolve()
                .then(() => action(id))
                .catch(() => undefined)
                .finally(() => {
                    if (mounted.current && activeRun.current === runId) {
                        activeRun.current = undefined
                        setBusyId(undefined)
                    }
                })
        }
    }

    return { busyId, run }
}

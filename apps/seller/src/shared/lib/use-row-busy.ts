import { useEffect, useRef, useState } from "react"

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

    function run(action: (id: string) => Promise<unknown>) {
        return (id: string) => {
            const runId = Symbol(id)
            activeRun.current = runId
            setBusyId(id)
            const done = Promise.resolve().then(() => action(id))
            // 复位挂在吞掉 rejection 的兜底链上，与调用点接不接结果无关；别把 catch 删了否则发射即忘会炸
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

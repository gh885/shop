/**
 * SSH 隧道的生命周期。没有环境变量、进程信号或退出副作用，导入不会操作机器。
 * runtime 是内部 seam：CLI 提供真实进程/探针/时钟，测试提供内存替身。
 * start() 返回 { exited: Promise<string>, stop() }；wait(ms, signal) 必须可取消。
 */
export async function superviseTunnel({ runtime, signal, giveUpAfterFastFails, onRetry }) {
    let child
    const stopChild = () => {
        const running = child
        child = undefined
        running?.stop()
    }
    signal.addEventListener("abort", stopChild, { once: true })
    let backoff = 500
    let fastFails = 0
    try {
        if (signal.aborted) return { reason: "stopped" }
        await runtime.assertOwnership()
        // oxlint-disable no-await-in-loop -- 生命周期逐步推进，下一步必须等上一轮探测/退出完成
        while (!signal.aborted) {
            const open = await runtime.portsOpen()
            if (signal.aborted) break
            if (open) {
                fastFails = 0
                await runtime.wait(3000, signal)
                continue
            }
            // 重连前再认一次属主：旧隧道退出后，端口可能被别的进程接管。
            await runtime.assertOwnership()
            if (signal.aborted) break
            const started = runtime.now()
            child = runtime.start()
            const why = await child.exited
            child = undefined
            if (signal.aborted) break
            const lived = runtime.now() - started
            if (lived > 30_000) {
                backoff = 500
                fastFails = 0
            } else {
                fastFails += 1
            }
            const givingUp = giveUpAfterFastFails && fastFails >= 8
            onRetry({ lived, why, backoff, fastFails, givingUp })
            if (givingUp) return { reason: "failed", fastFails }
            await runtime.wait(backoff, signal)
            backoff = Math.min(backoff * 2, 15_000)
        }
        // oxlint-enable no-await-in-loop
        return { reason: "stopped" }
    } catch (error) {
        if (!signal.aborted) throw error
        return { reason: "stopped" }
    } finally {
        signal.removeEventListener("abort", stopChild)
        stopChild()
    }
}

// 测量口径的唯一来源：屏幕模拟、UA、网络节流全部取自 LHCI 锁定的那份 Lighthouse，不手抄。
//
// 手抄一份常量就是再养一份会悄悄漂移的真相：Lighthouse 升级换了机器或 UA，抄的那份不会跟着变，
// 而且不会报错——两份数字从此不可比，还看不出来。`perf-cls` 与 `pnpm perf` 能对得上，靠的是
// 同一个来源，不是注释里「记得改这里」。
//
// 这是进程内加载的 Lighthouse 子模块（LHCI 锁 12.6.1），不是另装一份引擎：`runtime.mjs`
// 用 `@lhci/cli` 的 require 解析出它自带的那个包。
import { lighthousePath } from "./runtime.mjs"

const constants = await import(lighthousePath("core/config/constants.js"))

/** 屏幕模拟：mobile 是 moto g power (2022) 412×823 DPR1.75，desktop 是 1350×940 DPR1 */
export const screenEmulation = constants.screenEmulationMetrics

/** 与屏幕模拟配套的 UA，两端各一条 */
export const userAgents = constants.userAgents

/**
 * CDP `Network.emulateNetworkConditions` 要的是字节/秒，Lighthouse 常量是 kbps 且已含
 * devtools 调整系数（downloadThroughputKbps = throughputKbps × 0.9）。
 * 直接取调整后的那一项：这是 Lighthouse 自己 devtools throttling 用的值。
 */
export function networkProfile(name) {
    const { rttMs, downloadThroughputKbps, uploadThroughputKbps } = constants.throttling[name]
    return {
        latency: rttMs,
        downloadThroughput: (downloadThroughputKbps * 1024) / 8,
        uploadThroughput: (uploadThroughputKbps * 1024) / 8,
    }
}

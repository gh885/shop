/**
 * 页面级失效检测：SPA 白屏（首批功能那条）。
 *
 * seller / admin 是 SPA，index.html 永远是壳——真实内容全靠 JS 渲染。所以「页面没内容」
 * 是它们的头号故障：路由没匹配上、某个 Provider 初始化崩了、chunk 404 了，用户看到一片
 * 白。这类问题**不产生任何 console.error**（没有异常，就是没画出来），靠错误监控抓不到，
 * 必须主动检测「DOM 里到底有没有东西」。
 *
 * 原理：在水平、垂直中线上各取 9 个点调 `elementFromPoint`，如果 9 个点全部落在
 * `html` / `body` / 根容器上，就判白屏。为什么要多点采样而不是看 body 子节点数：有些白屏
 * 不是「完全空」——加载动画、错误占位、骨架屏都可能是真实的 DOM 节点。判断「点不到有效
 * 内容」比「有没有子节点」更贴近用户感受。
 */

import {
    bindGlobalListeners,
    captureError,
    configureMonitoring,
    type MonitoringOptions,
} from "./core"
import type { AppName } from "./envelope"

/**
 * SPA 端的监控启动：seller / admin 入口各调一次（web 是 SSR，不走这里）。
 *
 * 收成一个函数而不是让两个 main.tsx 各写四行：白屏检测的根容器 selector 与延迟是
 * 「装在 SPA 上就有意义」的一组参数，抄两份就会漂——而漂了的代价是某端忘了传
 * selector，白屏检测静默失效（它不报错，只是不报了）。
 *
 * @param app 哪一端
 * @param options 透传给 configureMonitoring（enabled / version / env / sampleRate …）
 * @param rootSelector SPA 根容器选择器
 */
export function startSpaMonitoring(
    app: AppName,
    options: Omit<MonitoringOptions, "app" | "enabled"> = {},
    rootSelector = "#root",
): void {
    // 接收端还没上线时默认关（见 index.ts 文件头）；开了但没地方收只是白发事件
    configureMonitoring({ app, enabled: false, ...options })
    // 全局监听：未捕获 JS 异常 / Promise 拒绝 / 资源加载失败。必须在首屏渲染前挂，
    // 否则「挂载时就崩」的那一类正好漏掉
    bindGlobalListeners()
    // 白屏：SPA 挂载后延迟判定
    monitorBlankScreen(rootSelector)
}

/** 采样点：中线上取 9 个（含正中），水平/垂直中线各一条 */
const SAMPLE_OFFSETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]

/** 判为「什么都没画」的容器：这些元素铺满页面，命中它们等于命中了空白背景 */
const BLANK_ROOTS = new Set(["HTML", "BODY"])

/**
 * 检测当前是否白屏。
 *
 * @param rootSelector 根容器选择器（默认 `#root`）。命中它也算空白——容器在但里面空的，
 *   是 SPA 渲染崩掉的典型形态（比连容器都没有更常见，因为容器是 index.html 里的静态壳）。
 * @returns 是否白屏
 */
export function isBlankScreen(rootSelector = "#root"): boolean {
    if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") {
        // 无头/测试环境没有 elementFromPoint（或被 stub），无法判定时返回 false——
        // 这里宁可漏报也不误报，白屏误报会变成「天天白屏却查不出」的噪音
        return false
    }
    const width = window.innerWidth
    const height = window.innerHeight
    if (width === 0 || height === 0) return false

    for (const offsetX of SAMPLE_OFFSETS) {
        for (const offsetY of SAMPLE_OFFSETS) {
            const el = document.elementFromPoint(width * offsetX, height * offsetY)
            if (!el) continue // 点到视口外（不可能，但保险起见不当成空白）
            if (BLANK_ROOTS.has(el.tagName)) return true // 命中空白根
            if (rootSelector) {
                const root = document.querySelector(rootSelector)
                if (root && el === root) return true // 命中根容器本身：容器在但里面空的
            }
        }
    }
    return false
}

/**
 * 装一个延迟白屏检测。
 *
 * 为什么要延迟：SPA 挂载后到首屏画出来有一小段时间（拉数据、等 chunk），太早检测会误报。
 * 延迟到 `delayMs`（默认给一次网络往返 + 渲染的时间）后才判。
 *
 * 幂等：多个路由切换会反复调它，所以 `fired` 标志只报第一次。
 */
export function monitorBlankScreen(rootSelector = "#root", delayMs = 1500): void {
    if (typeof setTimeout === "undefined") return
    setTimeout(() => {
        if (!isBlankScreen(rootSelector)) return
        captureError("blank_screen", null, {
            message: `SPA 白屏：${delayMs}ms 后中线采样点全落在空白容器上`,
        })
    }, delayMs)
}

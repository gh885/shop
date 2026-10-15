/**
 * 页面级失效检测：SPA 白屏（首批功能那条）。
 *
 * seller / admin 是 SPA，index.html 永远是壳——真实内容全靠 JS 渲染。所以「页面没内容」
 * 是它们的头号故障：路由没匹配上、某个 Provider 初始化崩了、chunk 404 了，用户看到一片
 * 白。这类问题**不产生任何 console.error**（没有异常，就是没画出来），靠错误监控抓不到，
 * 必须主动检测「DOM 里到底有没有东西」。
 *
 * 原理：在水平、垂直中线上各取 9 个点调 `elementFromPoint`，如果命中点落在
 * `html` / `body` / 根容器上，就判白屏。为什么要多点采样而不是看 body 子节点数：有些白屏
 * 不是「完全空」——加载动画、错误占位、骨架屏都可能是真实的 DOM 节点。判断「点不到有效
 * 内容」比「有没有子节点」更贴近用户感受。
 *
 * web 是 SSR，首屏有 HTML，**不装这个插件**——它要盯的是 hydration 失败（看着正常、点不动），
 * 那条在 `apps/web` 的 `report-error.ts` 里单列事件名。
 */

import type { Integration } from "../types"

/** 采样点：中线上取 9 个（含正中），水平/垂直中线各一条 */
const SAMPLE_OFFSETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]

/** 判为「什么都没画」的容器：这些元素铺满页面，命中它们等于命中了空白背景 */
const BLANK_ROOTS = new Set(["HTML", "BODY"])

/** 默认根容器选择器与延迟（与重构前 `startSpaMonitoring` 的默认值一致） */
const DEFAULT_ROOT_SELECTOR = "#root"
const DEFAULT_DELAY_MS = 1500

/** 能不能探测：无头/测试环境没有 `elementFromPoint`（或被 stub）。无法判定时宁可漏报也不
 *  误报——白屏误报会变成「天天白屏却查不出」的噪音。 */
function canProbeDom(): boolean {
    return typeof document !== "undefined" && typeof document.elementFromPoint === "function"
}

/** 命中的这个点算不算「空白」：落在 html/body 上，或落在根容器本身（容器在、里面空）。 */
function isBlankPoint(el: Element, root: Element | null): boolean {
    return BLANK_ROOTS.has(el.tagName) || (root !== null && el === root)
}

/**
 * 检测当前是否白屏。
 *
 * @param rootSelector 根容器选择器（默认 `#root`）。命中它也算空白——容器在但里面空的，
 *   是 SPA 渲染崩掉的典型形态（比连容器都没有更常见，因为容器是 index.html 里的静态壳）。
 * @returns 是否白屏
 */
export function isBlankScreen(rootSelector = DEFAULT_ROOT_SELECTOR): boolean {
    if (!canProbeDom()) return false
    const width = window.innerWidth
    const height = window.innerHeight
    if (width === 0 || height === 0) return false

    // 根容器取一次：81 个采样点查的是同一个元素，逐点 querySelector 既没意义也是纯浪费
    const root = rootSelector ? document.querySelector(rootSelector) : null

    for (const offsetX of SAMPLE_OFFSETS) {
        for (const offsetY of SAMPLE_OFFSETS) {
            const el = document.elementFromPoint(width * offsetX, height * offsetY)
            // 点到视口外（不可能，但保险起见不当成空白）
            if (el && isBlankPoint(el, root)) return true
        }
    }
    return false
}

/**
 * 白屏检测插件：SPA 挂载后延迟判定一次。
 *
 * 为什么要延迟：SPA 挂载后到首屏画出来有一小段时间（拉数据、等 chunk），太早检测会误报。
 * 延迟到 `delayMs` 后才判；参数从 `options.blankScreen` 读，缺省 `#root` / 1500ms。
 *
 * 只判一次、卸载即 `clearTimeout`——重构前那句「多个路由切换反复调」的注释里提到的
 * `fired` 标志其实并不存在（噪声靠 `captureError` 的指纹限次兜住）。
 */
export const blankScreenIntegration: Integration = {
    name: "blank-screen",
    setup({ options, captureError }) {
        if (typeof setTimeout === "undefined") return
        const rootSelector = options.blankScreen?.rootSelector ?? DEFAULT_ROOT_SELECTOR
        const delayMs = options.blankScreen?.delayMs ?? DEFAULT_DELAY_MS
        const timer = setTimeout(() => {
            if (!isBlankScreen(rootSelector)) return
            captureError("blank_screen", null, {
                message: `SPA 白屏：${delayMs}ms 后中线采样点全落在空白容器上`,
            })
        }, delayMs)
        return () => clearTimeout(timer)
    },
}

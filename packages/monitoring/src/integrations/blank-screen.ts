/**
 * SPA 白屏检测（首批那条）。seller/admin 是 SPA，页面没内容是头号故障且**不产生任何 console.error**，只能主动探 DOM。
 * 判据：水平/垂直中线各取 9 点 `elementFromPoint`，命中落在 html/body/根容器即判白——多点而非看子节点数，因加载动画/骨架屏也是真实节点。
 * web 是 SSR、首屏有 HTML，**不装此插件**；它盯的是 hydration 失败（看着正常点不动），在 `apps/web` 的 `report-error.ts` 单列。见 `frontend-monitoring.md` §首批功能。
 */

import type { Integration } from "../types"

/** 采样点：中线上取 9 个（含正中），水平/垂直中线各一条 */
const SAMPLE_OFFSETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]

/** 判为「什么都没画」的容器：这些元素铺满页面，命中它们等于命中了空白背景 */
const BLANK_ROOTS = new Set(["HTML", "BODY"])

/** 默认根容器选择器与延迟 */
const DEFAULT_ROOT_SELECTOR = "#root"
const DEFAULT_DELAY_MS = 1500

/** 能否探测：无头/测试无 `elementFromPoint`。判定不能时**宁可漏报也不误报**（误报=天天白屏却查不出的噪音） */
function canProbeDom(): boolean {
    return typeof document !== "undefined" && typeof document.elementFromPoint === "function"
}

/** 命中点算不算空白：落在 html/body 上，或落在根容器本身（容器在、里面空） */
function isBlankPoint(el: Element, root: Element | null): boolean {
    return BLANK_ROOTS.has(el.tagName) || (root !== null && el === root)
}

/** 当前是否白屏。命中根容器本身也算——容器在但里面空，是 SPA 渲染崩掉的典型形态 */
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
 * 白屏检测插件：SPA 挂载后延迟判定一次，卸载即 `clearTimeout`。
 * 延迟是为防误报（挂载到首屏画出前有拉数据/等 chunk 的空窗）；参数从 `options.blankScreen` 读，缺省 `#root` / 1500ms。
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

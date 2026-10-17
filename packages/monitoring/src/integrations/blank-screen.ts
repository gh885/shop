// SPA 白屏检测：seller/admin 是 SPA，页面没内容是头号故障且不产生任何 console.error，只能主动探 DOM。判据：水平/垂直中线各取 9 点 elementFromPoint，命中落在 html/body/根容器即判白（多点而非看子节点数，因骨架屏也是真实节点）。web 是 SSR、首屏有 HTML，不装此插件。见 frontend-monitoring.md §首批功能。

import type { Integration } from "../types"

const SAMPLE_OFFSETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]

/** 铺满页面，命中它们等于命中空白背景 */
const BLANK_ROOTS = new Set(["HTML", "BODY"])

const DEFAULT_ROOT_SELECTOR = "#root"
const DEFAULT_DELAY_MS = 1500

/** 无头/测试无 elementFromPoint。判不能时宁可漏报也不误报（误报=天天白屏却查不出的噪音） */
function canProbeDom(): boolean {
    return typeof document !== "undefined" && typeof document.elementFromPoint === "function"
}

/** 落在 html/body 上，或落在根容器本身（容器在、里面空） */
function isBlankPoint(el: Element, root: Element | null): boolean {
    return BLANK_ROOTS.has(el.tagName) || (root !== null && el === root)
}

/** 命中根容器本身也算——容器在但里面空，是 SPA 渲染崩掉的典型形态 */
export function isBlankScreen(rootSelector = DEFAULT_ROOT_SELECTOR): boolean {
    if (!canProbeDom()) return false
    const width = window.innerWidth
    const height = window.innerHeight
    if (width === 0 || height === 0) return false

    // 根容器取一次：81 个采样点查的是同一个元素，逐点 querySelector 既没意义也纯浪费
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

/** SPA 挂载后延迟判定一次，卸载即 clearTimeout。延迟是为防误报（挂载到首屏画出前有拉数据/等 chunk 的空窗） */
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

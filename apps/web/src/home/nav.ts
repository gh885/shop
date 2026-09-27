/**
 * 首页分类导航的标题预算 —— 纯算式，不碰 DOM。
 *
 * 「按像素预算截断」这件事看着像样式，其实是**决定**：合并标题（`" A / B / C "`）里每一组都是
 * 一个可点的导航项，装不下就整组不显示——既不切半字也不画省略号，因为切开的「女装/男装拼」
 * 会被读成一个不存在的分类。完整名在 tooltip 与右侧 mega 面板里，所以少画一组不丢信息。
 *
 * 宽度是估的（没有 measure）：拿估算值做决定就要能让它单测，而不是留在组件里靠肉眼看。
 */

/** 行内显示名的文字区宽度预算（px） */
export const NAV_TITLE_MAX_WIDTH = 210

/** 一个汉字的宽度（px）：按 text-sm 的 14px 字号估 */
const HAN_CHAR_PX = 14

/** 分隔符 ` / ` 的宽度（px）：三个空格加一斜杠，比汉字窄 */
const SEPARATOR_PX = 11

/**
 * 合并标题按「 / 」整组装进宽度预算，装不下的组不显示。
 *
 * 第一组永远显示，哪怕它自己就超预算——一个字的导航项也比空的强。
 */
export function navTitle(title: string, maxWidth: number = NAV_TITLE_MAX_WIDTH): string {
    const [first = "", ...rest] = title.split(" / ")
    let shown = first
    let width = first.length * HAN_CHAR_PX
    for (const part of rest) {
        const next = width + SEPARATOR_PX + part.length * HAN_CHAR_PX
        if (next > maxWidth) break
        shown += ` / ${part}`
        width = next
    }
    return shown
}

export const NAV_TITLE_MAX_WIDTH = 210

const HAN_CHAR_PX = 14

const SEPARATOR_PX = 11

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

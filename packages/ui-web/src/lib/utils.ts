export { cn } from "cn"

import type { CSSProperties } from "react"

/** 可写 CSS 自定义属性的 style 类型（DESIGN.md §0.7）。React 的 `CSSProperties` 不认 `--` 键，
    而 `shadcn/no-inline-styles` 只放行「纯 CSS 变量」字面量（运行时包装函数会被判成动态 style），
    所以这里只补类型不给函数：`const s: CSSVars = { "--ratio": r }` → `style={s}`，
    或就地 `{{ "--ratio": r } as CSSVars}`。 */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number | undefined>

/** 页码压缩：1 … 3 4 5 … 20（首尾固定，当前页前后各一） */
export function getPageNumbers(current: number, total: number): (number | "...")[] {
    if (total <= 7) {
        return Array.from({ length: total }, (_, i) => i + 1)
    }
    const nums = new Set<number>([1, total, current - 1, current, current + 1])
    const sorted = [...nums].filter((n) => n >= 1 && n <= total).toSorted((a, b) => a - b)
    const result: (number | "...")[] = []
    let prev = 0
    for (const n of sorted) {
        if (prev && n - prev > 1) result.push("...")
        result.push(n)
        prev = n
    }
    return result
}

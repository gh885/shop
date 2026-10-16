export { cn } from "cn"

import type { CSSProperties } from "react"

/** 可写 CSS 自定义属性的 style 类型（DESIGN.md §4.2）：React CSSProperties 不认 -- 键、shadcn/no-inline-styles 只放行纯 CSS 变量字面量，故只补类型不给函数 */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number | undefined>

/** 页码序列项：页码或省略号占位 */
export type PagedItems = (number | "...")[]

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/** 页码序列（非表格分页条用；表格走 reui DataGridPagination）：钉住省略号不出现在只差一页的缝隙上（如 `1 … 3`）、首尾页任何时刻都在 */
export function paged(current: number, total: number): PagedItems {
    if (total <= 7) return range(1, total)
    const pages = new Set<number>([1, total])
    for (let p = current - 2; p <= current + 2; p++) {
        if (p >= 1 && p <= total) pages.add(p)
    }
    const sorted = [...pages].toSorted((a, b) => a - b)
    const out: PagedItems = []
    let prev = 0
    for (const p of sorted) {
        if (p - prev > 1) out.push("...")
        out.push(p)
        prev = p
    }
    return out
}

export { cn } from "cn"

import type { CSSProperties } from "react"

/** 可写 CSS 自定义属性的 style 类型（DESIGN.md §4.2）。React 的 `CSSProperties` 不认 `--` 键，
    而 `shadcn/no-inline-styles` 只放行「纯 CSS 变量」字面量（运行时包装函数会被判成动态 style），
    所以这里只补类型不给函数：`const s: CSSVars = { "--ratio": r }` → `style={s}`，
    或就地 `{{ "--ratio": r } as CSSVars}`。 */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number | undefined>

/** 页码序列项：页码或省略号占位 */
export type PagedItems = (number | "...")[]

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

/**
 * 页码序列：当前页 ±2 + 首尾 + 省略号。非表格的列表分页条（app-kit `PaginationBar`）
 * 用这一份——表格分页条已交给 reui `DataGridPagination`（它自带窗口算法，见 DataTableCard）。
 *
 * 只钉两件事：省略号**不能出现在只差一页的缝隙上**（`1 … 3` 那种，中间其实没漏页，
 * 却让用户以为列表被折断了），以及首尾页任何时刻都在（不点到底就翻不完）。
 */
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

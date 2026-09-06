export type PagedItems = (number | "...")[]

/**
 * 页码序列：当前页 ±2 + 首尾 + 省略号。返回数字与 "..." 的混合数组。
 * 纯算法，不依赖 React / 路由。
 */
export function paged(current: number, total: number): PagedItems {
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
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

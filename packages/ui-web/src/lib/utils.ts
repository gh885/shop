export { cn } from "cn"

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

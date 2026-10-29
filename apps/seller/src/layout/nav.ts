import { activeSectionOf, type SidebarItem } from "@shop/app-kit/shell"
import type { Crumb } from "#/shared/ui/PageBreadcrumb"

// 通栏页（无侧栏、无面包屑）：当前没有这类页面；集合保留给 AppShell 判定，新通栏页把路径加进来即可
export const FULL_WIDTH_PATHS: ReadonlySet<string> = new Set([])

// fallow-ignore-next-line complexity
export function leafLabelOf(items: SidebarItem[], pathname: string, fallbackTitle: string): string {
    for (const item of items) {
        if (!("sections" in item)) continue
        for (const section of item.sections) {
            const hit = section.items.find((leaf) => leaf.to === pathname)
            if (hit) return hit.label
        }
    }
    return fallbackTitle
}

export function crumbsOf(
    items: SidebarItem[],
    pathname: string,
    labels: { home: string; fallback: string },
): Crumb[] {
    const section = activeSectionOf(items, pathname)
    if (!section) return [{ label: labels.home, to: "/" }]
    return [
        { label: labels.home, to: "/" },
        { label: section.label },
        { label: leafLabelOf(items, pathname, labels.fallback) },
    ]
}

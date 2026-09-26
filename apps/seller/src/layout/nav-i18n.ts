import { translateSidebarItems, type SidebarItem } from "@shop/app-kit"

export function translateSellerNav(
    items: SidebarItem[],
    t: (key: string) => string,
): SidebarItem[] {
    return translateSidebarItems(items, t, {
        groupKey: (key) => `seller.nav.${key}`,
        leafKey: (to) => `seller.nav.${to.replace(/^\/+/, "").replaceAll("/", ".")}`,
        sectionKey: (group, index) => `seller.nav.${group}.section.${index}`,
    })
}

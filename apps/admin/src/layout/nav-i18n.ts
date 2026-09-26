import { translateSidebarItems, type SidebarItem } from "@shop/app-kit"

export function translateAdminNav(items: SidebarItem[], t: (key: string) => string): SidebarItem[] {
    return translateSidebarItems(items, t, {
        groupKey: (key) => `admin.nav.${key}`,
        leafKey: (to) =>
            to === "/"
                ? "admin.page.home"
                : `admin.page.${to.replace(/^\/+/, "").replaceAll("/", ".")}`,
        sectionKey: (group, index) => `admin.nav.${group}.section.${index}`,
    })
}

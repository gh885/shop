import { translateSidebarItems, type SidebarItem } from "@shop/app-kit"

import type { AdminTranslate } from "#/locales/messages.gen"

/**
 * 侧栏的 key 是按规则现拼的（`admin.nav.<key>` / `admin.page.<to>`），生成物那份 key 联合接不住
 * 这条动态路径，所以在这里把 `t` 放宽回共享助手的形状：拼不出来的 key 由 `t` 回退成 key 本身
 * （菜单露出中文路径名，不白屏）。§10.1「未使用 key」定成字面量常量表之后，这条放宽就能取消。
 */
export function translateAdminNav(items: SidebarItem[], t: AdminTranslate): SidebarItem[] {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- 动态 key 接不住生成物的 key 联合，见上注释；§10.1 定成常量表后删
    return translateSidebarItems(items, t as (key: string) => string, {
        groupKey: (key) => `admin.nav.${key}`,
        leafKey: (to) =>
            to === "/"
                ? "admin.page.home"
                : `admin.page.${to.replace(/^\/+/, "").replaceAll("/", ".")}`,
        sectionKey: (group, index) => `admin.nav.${group}.section.${index}`,
    })
}

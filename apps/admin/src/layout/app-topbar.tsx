import { useMemo } from "react"
import { useLocation } from "@tanstack/react-router"
import { activeSectionOf, translateSidebarItems, WorkbenchTopBar } from "@shop/app-kit/shell"
import { useT } from "#/locales/use-t"
import { Account } from "./account"
import { HOME_LINK, NAV_SOURCE_ITEMS } from "./nav"

export function AppTopBar() {
    // 整份而不是收窄的 `useT("layout")`：这张菜单表的 labelKey 跨 `nav.*` 与
    // `page.*` 两个 namespace，收窄形态按设计不收别的 namespace 的 key（§4.2 末段）
    const t = useT()
    const { pathname } = useLocation()
    const items = useMemo(() => translateSidebarItems(NAV_SOURCE_ITEMS, t), [t])
    const section = activeSectionOf(items, pathname)
    const title =
        section?.sections.flatMap((group) => group.items).find((item) => item.to === pathname)
            ?.label ?? t("layout.brand")

    return (
        <WorkbenchTopBar
            brand={t("layout.brand")}
            home={HOME_LINK}
            title={title}
            account={<Account />}
        />
    )
}

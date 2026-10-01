import { useMemo } from "react"
import { useLocation } from "@tanstack/react-router"
import { activeSectionOf, translateSidebarItems, WorkbenchTopBar } from "@shop/app-kit"
import { useT } from "#/locales/use-t"
import { Account } from "./account"
import { HOME_LINK, NAV_SOURCE_ITEMS } from "./nav"

export function AppTopBar() {
    const t = useT()
    const { pathname } = useLocation()
    const items = useMemo(() => translateSidebarItems(NAV_SOURCE_ITEMS, t), [t])
    const section = activeSectionOf(items, pathname)
    const title =
        section?.sections.flatMap((group) => group.items).find((item) => item.to === pathname)
            ?.label ?? t("admin.layout.brand")

    return (
        <WorkbenchTopBar
            brand={t("admin.layout.brand")}
            home={HOME_LINK}
            title={title}
            account={<Account />}
        />
    )
}

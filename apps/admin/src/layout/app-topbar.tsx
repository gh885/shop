import { useMemo } from "react"
import { useLocation } from "@tanstack/react-router"
import { activeSectionOf, useT, WorkbenchTopBar } from "@shop/app-kit"
import { Account } from "./account"
import { HOME_LINK, NAV_ITEMS } from "./nav"
import { translateAdminNav } from "./nav-i18n"

export function AppTopBar() {
    const t = useT()
    const { pathname } = useLocation()
    const items = useMemo(() => translateAdminNav(NAV_ITEMS, t), [t])
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

import { useLocation } from "@tanstack/react-router"
import { activeSectionOf, WorkbenchTopBar } from "@shop/app-kit"
import { Account } from "./account"
import { HOME_LINK, NAV_ITEMS } from "./nav"

export function AppTopBar() {
    const { pathname } = useLocation()
    const section = activeSectionOf(NAV_ITEMS, pathname)
    const title =
        section?.sections.flatMap((group) => group.items).find((item) => item.to === pathname)
            ?.label ?? "平台管理"

    return (
        <WorkbenchTopBar
            brand="Shop 平台"
            home={HOME_LINK}
            title={title}
            account={<Account />}
        />
    )
}

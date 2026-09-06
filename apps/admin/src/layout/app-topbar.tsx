import { Link, useLocation } from "@tanstack/react-router"
import {
    SidebarTrigger,
    TopBar,
    TopBarActions,
    TopBarBrand,
    TopBarNav,
    TopBarNavItem,
} from "@shop/ui-web"

import { AccountAvatar } from "./account"
import { NAV, activeDomain } from "./nav"
import { ThemeToggle } from "./theme-toggle"

// 顶栏：左侧折叠触发器 + 一级 Tab（业务域），右侧亮暗切换 + 账号头像。
// 品牌与完整账号在侧栏（SidebarHeader / SidebarFooter 的 <Account />）。
export function AppTopBar() {
    const { pathname } = useLocation()
    const domain = activeDomain(pathname)

    return (
        <TopBar>
            <TopBarBrand>
                <SidebarTrigger className="-ml-2" />
            </TopBarBrand>

            <TopBarNav>
                {NAV.map((d) =>
                    d.groups.length === 0 ? undefined : (
                        <TopBarNavItem
                            key={d.key}
                            isActive={d === domain}
                            render={<Link {...d.groups[0]?.items[0]?.link} />}
                        >
                            {d.label}
                        </TopBarNavItem>
                    ),
                )}
            </TopBarNav>

            <TopBarActions>
                <ThemeToggle />
                <AccountAvatar />
            </TopBarActions>
        </TopBar>
    )
}

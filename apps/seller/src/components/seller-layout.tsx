import { Link, Outlet, useLocation } from '@tanstack/react-router';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarRail,
    SidebarTrigger,
    TopBar,
    TopBarActions,
    TopBarBrand,
} from '@shop/ui-web';
import { PackageIcon, StoreIcon, UsersIcon } from 'lucide-react';

import { Account, AccountAvatar } from './account';
import { ShopSwitcher } from './shop-switcher';

// 导航数据源：加页面只改这里
const NAV_GROUPS = [
    {
        label: '经营',
        items: [{ label: '商品管理', to: '/products', icon: PackageIcon }],
    },
    {
        label: '店铺',
        items: [
            { label: '店铺管理', to: '/shops', icon: StoreIcon },
            { label: '店员管理', to: '/members', icon: UsersIcon },
        ],
    },
] as const;

/** 工作台壳：侧栏（品牌 + 菜单 + 账号）+ 顶栏（折叠/店铺切换/头像）+ 内容区 */
export function SellerLayout() {
    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
                <AppTopBar />
                <main className="flex flex-1 flex-col p-6">
                    <Outlet />
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}

function AppSidebar() {
    const { pathname } = useLocation();

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <div className="flex items-center gap-2 px-2 py-1.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
                        <StoreIcon className="size-4" />
                    </div>
                    <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
                        卖家中心
                    </span>
                </div>
            </SidebarHeader>
            <SidebarContent>
                {NAV_GROUPS.map((group) => (
                    <SidebarGroup key={group.label}>
                        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {group.items.map((item) => (
                                    <SidebarMenuItem key={item.label}>
                                        <SidebarMenuButton
                                            isActive={pathname.startsWith(item.to)}
                                            render={<Link to={item.to} />}
                                        >
                                            <item.icon />
                                            <span>{item.label}</span>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
            <SidebarFooter>
                <Account />
            </SidebarFooter>
            <SidebarRail />
        </Sidebar>
    );
}

function AppTopBar() {
    return (
        <TopBar>
            <TopBarBrand>
                <SidebarTrigger className="-ml-2" />
            </TopBarBrand>
            <div className="flex min-w-0 flex-1 items-center px-2">
                <ShopSwitcher />
            </div>
            <TopBarActions>
                <AccountAvatar />
            </TopBarActions>
        </TopBar>
    );
}

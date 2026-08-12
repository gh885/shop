import { linkOptions, type LinkOptions } from '@tanstack/react-router';
import { ClipboardCheckIcon, type LucideIcon } from 'lucide-react';

// ---------- 导航数据源（唯一真相）：一级域 → 侧栏分组 → 菜单项 ----------
// TopBar 吃 key/label，AppSidebar 吃当前域的 groups，两处消费同一份数据。

export type NavItem = {
    label: string;
    link: LinkOptions; // linkOptions() 产物，to 被 routeTree 类型校验
    icon?: LucideIcon;
    badge?: string; // 待办角标，如 '12'，后续接待审数接口
    permission?: string; // 权限码，无权限整条不渲染（预留）
    children?: NavItem[]; // 三级子菜单 → SidebarMenuSub
};

export type NavGroup = {
    label?: string; // 侧栏分组标题，无 label = 平铺
    items: NavItem[];
};

export type NavDomain = {
    key: string; // 路由一级段，激活态判定用
    label: string; // 顶部 Tab 文案
    groups: NavGroup[]; // 该域侧栏；空数组 = 不显示侧栏
};

// 只写已实现的模块：功能到哪，菜单到哪
export const NAV: NavDomain[] = [
    {
        key: 'merchant',
        label: '商家',
        groups: [
            {
                items: [
                    {
                        label: '入驻审核',
                        // 审核页在 '/'，其 validateSearch 要求 page/size 必填
                        link: linkOptions({ to: '/', search: { page: 1, size: 20 } }),
                        icon: ClipboardCheckIcon,
                    },
                ],
            },
        ],
    },
];

/** 当前路由所属业务域：先按 `/{key}` 前缀精确匹配，兜底到第一个有菜单的域 */
export function activeDomain(pathname: string): NavDomain {
    return (
        NAV.find((d) => pathname.startsWith(`/${d.key}`)) ??
        NAV.find((d) => d.groups.length > 0) ??
        NAV[0]
    );
}

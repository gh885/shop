import { createElement } from "react"
import { linkOptions } from "@tanstack/react-router"
import { ListTreeIcon, ScaleIcon, TruckIcon, UserRoundIcon } from "lucide-react"
import type { SidebarItem, SidebarSourceItem } from "@shop/app-kit/shell"
import { ACCOUNT_MANAGE_PERMISSION } from "#/domains/account/constants"
import { LOGISTICS_MANAGE_PERMISSION } from "#/domains/logistics/constants"
import { GOVERNANCE_SHOP_REVIEW_PERMISSION } from "#/domains/governance/constants"

import type { AdminMessageKey } from "#/locales/messages.gen"

type SidebarGroupItem = Extract<SidebarItem, { sections: unknown }>

export const HOME_LINK = linkOptions({ to: "/", search: { page: 1, size: 20 } })

/**
 * 平台端导航。
 *
 * <p><b>只留后端真有端点的组：</b>账号（买家列表 + 员工管理）、类目（树 + 属性 + 配置）、
 * 物流（轨迹补录 / 核对 / 码表）。优惠券运营、审计、RUM、CMS、商家治理/审核那些组在重写期
 * 没有对应后端模块，菜单点进去只能是空表格——删掉比留个死入口诚实。等模块落回来时按
 * `docs/domain/module-map.md` 的清单加回来。
 */
export const NAV_SOURCE_ITEMS: readonly SidebarSourceItem<AdminMessageKey>[] = [
    {
        key: "account",
        labelKey: "nav.account",
        icon: createElement(UserRoundIcon),
        sections: [
            {
                titleKey: "nav.account.section.0",
                items: [
                    { key: "users", labelKey: "page.accounts.users", to: "/accounts/users" },
                    { key: "staff", labelKey: "page.accounts.staff", to: "/accounts/staff" },
                ],
            },
        ],
    },
    {
        key: "product",
        labelKey: "nav.product",
        icon: createElement(ListTreeIcon),
        sections: [
            {
                titleKey: "nav.product.section.0",
                items: [
                    {
                        key: "categories",
                        labelKey: "page.categories",
                        to: "/categories",
                    },
                ],
            },
        ],
    },
    {
        key: "governance",
        labelKey: "nav.governance",
        icon: createElement(ScaleIcon),
        sections: [
            {
                titleKey: "nav.governance.section.0",
                items: [
                    {
                        key: "governance-review",
                        labelKey: "page.governance.review",
                        to: "/governance",
                    },
                ],
            },
        ],
    },
    {
        key: "logistics",
        labelKey: "nav.logistics",
        icon: createElement(TruckIcon),
        sections: [
            {
                titleKey: "nav.logistics.section.0",
                items: [
                    {
                        key: "logistics",
                        labelKey: "page.logistics",
                        to: "/logistics",
                    },
                ],
            },
        ],
    },
]

// 漏加一行不会报错，只会「所有岗位都看得见」（后端仍会拒）
export const LEAF_PERMISSIONS: Record<string, string> = {
    users: ACCOUNT_MANAGE_PERMISSION,
    staff: ACCOUNT_MANAGE_PERMISSION,
    "governance-review": GOVERNANCE_SHOP_REVIEW_PERMISSION,
    logistics: LOGISTICS_MANAGE_PERMISSION,
}

/**
 * 权限清单未知（`undefined`）时一律放行。
 *
 * <p>重写期后端没有 `/api/staff/me`，前端拿不到权限码——如果按「未知即隐藏」处理，
 * 账号组会永远不出现。菜单可见性本来就不是安全边界（每个接口自己判权），
 * 所以这里偏向「看得见」。
 */
export function allowsLeaf(key: string, permissions: readonly string[] | undefined): boolean {
    const required = LEAF_PERMISSIONS[key]
    if (!required) return true
    if (permissions === undefined) return true
    return permissions.includes(required)
}

// 前端裁剪不是安全边界，闸门在后端
export function visibleNavGroups(
    items: readonly SidebarItem[],
    permissions: readonly string[] | undefined,
): SidebarGroupItem[] {
    return items
        .filter((item): item is SidebarGroupItem => "sections" in item)
        .map((item) => ({
            key: item.key,
            label: item.label,
            icon: item.icon,
            dividerAfter: item.dividerAfter,
            sections: item.sections
                .map((section) => ({
                    title: section.title,
                    collapsible: section.collapsible,
                    items: section.items.filter((leaf) => allowsLeaf(leaf.key, permissions)),
                }))
                .filter((section) => section.items.length > 0),
        }))
        .filter((item) => item.sections.length > 0)
}

import { createElement } from "react"
import { linkOptions } from "@tanstack/react-router"
import {
    ActivityIcon,
    LayoutTemplateIcon,
    ListTreeIcon,
    PercentIcon,
    ScrollTextIcon,
    StoreIcon,
    TruckIcon,
    UserRoundIcon,
} from "lucide-react"
import type { SidebarItem, SidebarSourceItem } from "@shop/app-kit/shell"
import { ACCOUNT_MANAGE_PERMISSION } from "#/account/constants"
import { COUPON_OPS_PERMISSION } from "#/coupon-ops/constants"
import { AUDIT_VIEW_PERMISSION } from "#/audit/constants"
import { LOGISTICS_MANAGE_PERMISSION } from "#/logistics/constants"
import { RUM_VIEW_PERMISSION } from "#/rum/constants"
import { SHOP_GOVERNANCE_PERMISSION } from "#/shop-ops/constants"

import type { AdminMessageKey } from "#/locales/messages.gen"

type SidebarGroupItem = Extract<SidebarItem, { sections: unknown }>

export const HOME_LINK = linkOptions({ to: "/", search: { page: 1, size: 20 } })

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
        key: "merchant",
        labelKey: "nav.merchant",
        icon: createElement(StoreIcon),
        sections: [
            {
                titleKey: "nav.merchant.section.0",
                items: [
                    { key: "review", labelKey: "page.home", ...HOME_LINK },
                    { key: "shops", labelKey: "page.shops", to: "/shops" },
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
        key: "coupon-ops",
        labelKey: "nav.coupon-ops",
        icon: createElement(PercentIcon),
        sections: [
            {
                titleKey: "nav.coupon-ops.section.0",
                items: [
                    {
                        key: "coupon-ops",
                        labelKey: "page.coupon-ops",
                        to: "/coupon-ops",
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
    {
        key: "audit",
        labelKey: "nav.audit",
        icon: createElement(ScrollTextIcon),
        sections: [
            {
                titleKey: "nav.audit.section.0",
                items: [{ key: "audits", labelKey: "page.audits", to: "/audits" }],
            },
        ],
    },
    {
        key: "rum",
        labelKey: "nav.rum",
        icon: createElement(ActivityIcon),
        sections: [
            {
                titleKey: "nav.rum.section.0",
                items: [{ key: "rum", labelKey: "page.rum", to: "/rum" }],
            },
        ],
    },
    {
        key: "cms",
        labelKey: "nav.cms",
        icon: createElement(LayoutTemplateIcon),
        sections: [
            {
                titleKey: "nav.cms.section.0",
                items: [
                    { key: "cms-nav", labelKey: "page.cms.nav", to: "/cms/nav" },
                    { key: "cms-banner", labelKey: "page.cms.banner", to: "/cms/banner" },
                    {
                        key: "cms-recommend-tab",
                        labelKey: "page.cms.recommend-tab",
                        to: "/cms/recommend-tab",
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
    "coupon-ops": COUPON_OPS_PERMISSION,
    shops: SHOP_GOVERNANCE_PERMISSION,
    logistics: LOGISTICS_MANAGE_PERMISSION,
    audits: AUDIT_VIEW_PERMISSION,
    rum: RUM_VIEW_PERMISSION,
}

export function allowsLeaf(key: string, permissions: readonly string[] | undefined): boolean {
    const required = LEAF_PERMISSIONS[key]
    if (!required) return true
    return permissions?.includes(required) ?? false
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

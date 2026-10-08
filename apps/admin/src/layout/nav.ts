import { createElement } from "react"
import { linkOptions } from "@tanstack/react-router"
import {
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
import { SHOP_GOVERNANCE_PERMISSION } from "#/shop-ops/constants"

import type { AdminMessageKey } from "#/locales/messages.gen"

/** 侧栏分组（带 sections 的那一半）：本项目的入口都是分组，顶层叶子在这里不出现 */
type SidebarGroupItem = Extract<SidebarItem, { sections: unknown }>

/** 审核页位于根路径；显式保留分页初始值。 */
export const HOME_LINK = linkOptions({ to: "/", search: { page: 1, size: 20 } })

/**
 * 只列已实现的功能；两级菜单消费同一份数据。
 *
 * 这份表写的是 i18n key（`labelKey` / `titleKey`）不是中文，句子在翻译那一步换出来；
 * 标注成 `SidebarSourceItem<AdminMessageKey>` 让写错的 key 在这里是编译错误。
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

/** 单叶的权限码登记：新增带权限的页面时在这里加一行，漏加的后果是「所有岗位都看得见」（后端仍会拒） */
export const LEAF_PERMISSIONS: Record<string, string> = {
    users: ACCOUNT_MANAGE_PERMISSION,
    staff: ACCOUNT_MANAGE_PERMISSION,
    "coupon-ops": COUPON_OPS_PERMISSION,
    shops: SHOP_GOVERNANCE_PERMISSION,
    logistics: LOGISTICS_MANAGE_PERMISSION,
    audits: AUDIT_VIEW_PERMISSION,
}

/** 单叶是否可见：key → 所需权限码（缺省 = 任何岗位可见） */
export function allowsLeaf(key: string, permissions: readonly string[] | undefined): boolean {
    const required = LEAF_PERMISSIONS[key]
    if (!required) return true
    return permissions?.includes(required) ?? false
}

/**
 * 侧栏按「当前员工的权限码」裁剪。
 *
 * 粒度分两层：整组（如「优惠券运营」「物流异常」「操作审计」只有一个入口）与组内单叶
 * （「商家」组里入驻审核要 SHOP_REVIEW、店铺治理要 SHOP_GOVERNANCE，两者是两拨人）。
 * 裁剪只影响「看不看得见」——真正的闸门在后端 @RequirePermission（前端裁剪是体验，不是安全边界）。
 *
 * 通配符 `*` 不在这里出现也不该出现：`StaffRole.declaredPermissions()` 在 me 出参就把 SUPER_ADMIN
 * 展开成全量码清单，通配符只活在服务端判权层。
 *
 * 叶子被裁光时 section 与整组一起收掉——留一个没有入口的分组标题，会让人以为权限没生效。
 */
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

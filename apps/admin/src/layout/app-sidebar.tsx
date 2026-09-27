import { useMemo } from "react"
import { useLocation } from "@tanstack/react-router"
import { useT, WorkbenchSidebar, type SidebarItem } from "@shop/app-kit"
import { ACCOUNT_MANAGE_PERMISSION } from "#/account/constants"
import { COUPON_OPS_PERMISSION } from "#/coupon-ops/constants"
import { AUDIT_VIEW_PERMISSION } from "#/audit/constants"
import { LOGISTICS_MANAGE_PERMISSION } from "#/logistics/constants"
import { SHOP_GOVERNANCE_PERMISSION } from "#/shop-ops/constants"
import { useMe } from "#/shared/lib/me"
import { NAV_ITEMS } from "./nav"
import { translateAdminNav } from "./nav-i18n"

/** 侧栏分组（带 sections 的那一半）：本项目的入口都是分组，顶层叶子在这里不出现 */
type SidebarGroupItem = Extract<SidebarItem, { sections: unknown }>

/** 单叶是否可见：key → 所需权限码（缺省 = 任何岗位可见） */
function allowsLeaf(key: string, permissions: readonly string[] | undefined): boolean {
    const required = LEAF_PERMISSIONS[key]
    if (!required) return true
    return permissions?.includes(required) ?? false
}

/** 单叶的权限码登记：新增带权限的页面时在这里加一行，漏加的后果是「所有岗位都看得见」（后端仍会拒） */
const LEAF_PERMISSIONS: Record<string, string> = {
    users: ACCOUNT_MANAGE_PERMISSION,
    staff: ACCOUNT_MANAGE_PERMISSION,
    "coupon-ops": COUPON_OPS_PERMISSION,
    shops: SHOP_GOVERNANCE_PERMISSION,
    logistics: LOGISTICS_MANAGE_PERMISSION,
    audits: AUDIT_VIEW_PERMISSION,
}

export function AppSidebar() {
    const t = useT()
    const { pathname } = useLocation()
    const { data: me } = useMe()
    const translatedItems = useMemo(() => translateAdminNav(NAV_ITEMS, t), [t])
    /**
     * 侧栏按「当前员工的权限码」裁剪。
     *
     * 粒度分两层：整组（如「优惠券运营」「物流异常」「操作审计」只有一个入口）与组内单叶
     * （「商家」组里入驻审核要 SHOP_REVIEW、店铺治理要 SHOP_GOVERNANCE，两者是两拨人）。
     * 裁剪只影响「看不看得见」——真正的闸门在后端 @RequirePermission（前端裁剪是体验，不是安全边界）。
     */
    const items = translatedItems
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
                    items: section.items.filter((leaf) => allowsLeaf(leaf.key, me?.permissions)),
                }))
                .filter((section) => section.items.length > 0),
        }))
        .filter((item) => item.sections.length > 0)

    return (
        <WorkbenchSidebar
            items={items}
            pathname={pathname}
        />
    )
}

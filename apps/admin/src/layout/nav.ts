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
import type { SidebarItem } from "@shop/app-kit"

/** 审核页位于根路径；显式保留分页初始值。 */
export const HOME_LINK = linkOptions({ to: "/", search: { page: 1, size: 20 } })

/** 只列已实现的功能；两级菜单消费同一份数据。 */
export const NAV_ITEMS: SidebarItem[] = [
    {
        key: "account",
        label: "账号",
        icon: createElement(UserRoundIcon),
        sections: [
            {
                title: "账号治理",
                items: [
                    { key: "users", label: "用户管理", to: "/accounts/users" },
                    { key: "staff", label: "员工管理", to: "/accounts/staff" },
                ],
            },
        ],
    },
    {
        key: "merchant",
        label: "商家",
        icon: createElement(StoreIcon),
        sections: [
            {
                title: "商家管理",
                items: [
                    { key: "review", label: "入驻审核", ...HOME_LINK },
                    { key: "shops", label: "店铺治理", to: "/shops" },
                ],
            },
        ],
    },
    {
        key: "product",
        label: "商品",
        icon: createElement(ListTreeIcon),
        sections: [
            {
                title: "商品基础数据",
                items: [{ key: "categories", label: "类目管理", to: "/categories" }],
            },
        ],
    },
    {
        key: "coupon-ops",
        label: "优惠券",
        icon: createElement(PercentIcon),
        sections: [
            {
                title: "营销运营",
                items: [{ key: "coupon-ops", label: "优惠券运营", to: "/coupon-ops" }],
            },
        ],
    },
    {
        key: "logistics",
        label: "物流",
        icon: createElement(TruckIcon),
        sections: [
            {
                title: "履约运维",
                items: [{ key: "logistics", label: "物流异常", to: "/logistics" }],
            },
        ],
    },
    {
        key: "audit",
        label: "审计",
        icon: createElement(ScrollTextIcon),
        sections: [
            {
                title: "治理留痕",
                items: [{ key: "audits", label: "操作审计", to: "/audits" }],
            },
        ],
    },
    {
        key: "cms",
        label: "内容",
        icon: createElement(LayoutTemplateIcon),
        sections: [
            {
                title: "首页运营（CMS）",
                items: [
                    { key: "cms-nav", label: "首页导航", to: "/cms/nav" },
                    { key: "cms-banner", label: "运营位 Banner", to: "/cms/banner" },
                    { key: "cms-recommend-tab", label: "推荐条词条", to: "/cms/recommend-tab" },
                ],
            },
        ],
    },
]

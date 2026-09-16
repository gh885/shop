import { createElement } from "react"
import { linkOptions } from "@tanstack/react-router"
import { StoreIcon } from "lucide-react"
import type { SidebarItem } from "@shop/app-kit"

/** 审核页位于根路径；显式保留分页初始值。 */
export const HOME_LINK = linkOptions({ to: "/", search: { page: 1, size: 20 } })

/** 只列已实现的功能；两级菜单消费同一份数据。 */
export const NAV_ITEMS: SidebarItem[] = [
    {
        key: "merchant",
        label: "商家",
        icon: createElement(StoreIcon),
        sections: [
            {
                title: "商家管理",
                items: [{ key: "review", label: "入驻审核", ...HOME_LINK }],
            },
        ],
    },
]

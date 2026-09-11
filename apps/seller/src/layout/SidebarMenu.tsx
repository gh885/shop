import type { ReactNode } from "react"
import {
    CalendarIcon,
    ChartColumnIcon,
    HeadsetIcon,
    HouseIcon,
    MegaphoneIcon,
    PackageIcon,
    StoreIcon,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────
// 侧边栏菜单契约：只描述菜单结构，不持有状态、不关心渲染。
// 二级叶子项的 `to` = 「/一级分组key/二级leaf key」两段式路径，
// 侧边栏选中态（一级分组 + 二级叶子）直接由 pathname 推导，无需额外状态。
// ─────────────────────────────────────────────────────────────

interface SubLeaf {
    key: string
    label: string
    /** 两段式路径：/一级分组key/二级leaf key */
    to: string
}

interface SubSection {
    title: string
    /** 可折叠分组：标题带 chevron，点击展开/收起，默认展开 */
    collapsible?: boolean
    items: SubLeaf[]
}

/** 一级项公共字段 */
interface SidebarItemBase {
    key: string
    label: string
    icon?: ReactNode
    /** 在此项之后渲染一条淡分隔线（轨内分组用） */
    dividerAfter?: boolean
}

/** 叶子一级项：可跳转路由 */
export interface SidebarLeaf extends SidebarItemBase {
    to: string
}

/** 分组一级项：子菜单（可含分组标题 / 可折叠分组） */
export interface SidebarGroup extends SidebarItemBase {
    sections: SubSection[]
}

/**
 * 一级菜单项：叶子（to）与分组（sections）可辨识二选一——
 * 编译期约束每项必须给全一种身份，消费端用 `in` 收窄即可，不再有 `item.to!` 这类断言。
 */
export type SidebarItem = SidebarLeaf | SidebarGroup

const isGroup = (item: SidebarItem): item is SidebarGroup => "sections" in item

// ── 菜单树（一级 key === 路径第一段；二级 leaf key === 路径第二段） ──
export const NAV_ITEMS: SidebarItem[] = [
    { key: "home", label: "首页", icon: <HouseIcon />, to: "/" },
    {
        key: "trade",
        label: "交易",
        icon: <CalendarIcon />,
        sections: [
            {
                title: "交易管理",
                items: [
                    { key: "order", label: "订单列表", to: "/trade/order" },
                    { key: "shipping", label: "运费模板", to: "/trade/shipping" },
                    { key: "ship", label: "发货", to: "/trade/ship" },
                    { key: "logistics", label: "物流跟踪", to: "/trade/logistics" },
                    { key: "refund", label: "退款售后", to: "/trade/refund" },
                ],
            },
            {
                title: "评价",
                collapsible: true,
                items: [
                    { key: "comment", label: "评价管理", to: "/trade/comment" },
                    { key: "buyershow", label: "买家秀", to: "/trade/buyershow" },
                ],
            },
        ],
    },
    {
        key: "product",
        label: "商品",
        icon: <PackageIcon />,
        sections: [
            {
                title: "商品管理",
                items: [
                    { key: "list", label: "商品列表", to: "/product/list" },
                    { key: "create", label: "发布商品", to: "/product/create/category" },
                    { key: "category", label: "商品分类", to: "/product/category" },
                    { key: "stock", label: "库存管理", to: "/product/stock" },
                ],
            },
            {
                title: "供应链",
                collapsible: true,
                items: [
                    { key: "supplier", label: "供应商管理", to: "/product/supplier" },
                    { key: "purchase", label: "采购单", to: "/product/purchase" },
                    { key: "price", label: "供货价管理", to: "/product/price" },
                ],
            },
        ],
    },
    {
        key: "shop",
        label: "店铺",
        icon: <StoreIcon />,
        sections: [
            {
                title: "店铺设置",
                items: [
                    { key: "list", label: "店铺管理", to: "/shop/list" },
                    { key: "address", label: "地址库", to: "/shop/address" },
                    { key: "member", label: "店员管理", to: "/shop/member" },
                    { key: "decoration", label: "店铺装修", to: "/shop/decoration" },
                    { key: "notice", label: "店铺公告", to: "/shop/notice" },
                ],
            },
            {
                title: "资质认证",
                collapsible: true,
                items: [
                    { key: "license", label: "营业执照", to: "/shop/license" },
                    { key: "brand", label: "品牌授权", to: "/shop/brand" },
                ],
            },
        ],
    },
    {
        key: "marketing",
        label: "营销",
        icon: <MegaphoneIcon />,
        sections: [
            {
                title: "营销工具",
                items: [
                    { key: "campaign", label: "营销活动", to: "/marketing/campaign" },
                    { key: "coupon", label: "优惠券", to: "/marketing/coupon" },
                    { key: "flash", label: "限时秒杀", to: "/marketing/flash" },
                ],
            },
        ],
    },
    { key: "service", label: "客服", icon: <HeadsetIcon />, to: "/service", dividerAfter: true },
    {
        key: "data",
        label: "数据",
        icon: <ChartColumnIcon />,
        sections: [
            {
                title: "经营分析",
                items: [
                    { key: "overview", label: "数据概览", to: "/data/overview" },
                    { key: "report", label: "经营报告", to: "/data/report" },
                    { key: "visit", label: "流量分析", to: "/data/visit" },
                ],
            },
        ],
    },
]

// ── 路径 → 菜单状态推导 ──

/** 由 pathname 推导所在一级分组项（pathname 第一段匹配分组 key）；分组才有二级面板 */
export function activeSectionOf(items: SidebarItem[], pathname: string): SidebarGroup | undefined {
    const groupKey = pathname.split("/")[1]
    return items.find((g): g is SidebarGroup => isGroup(g) && g.key === groupKey)
}

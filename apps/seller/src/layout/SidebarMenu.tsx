import {
    CalendarIcon,
    ChartColumnIcon,
    HeadsetIcon,
    HouseIcon,
    MegaphoneIcon,
    PackageIcon,
    StoreIcon,
} from "lucide-react"

import type { SidebarSourceItem } from "@shop/app-kit/shell"
import type { SellerMessageKey } from "#/locales/messages.gen"

// ── 菜单树（一级 key === 路径第一段；二级 leaf key === 路径第二段） ──
// labelKey / titleKey 写的是 i18n key 不是中文：这份表是**源**树，句子在 translateSellerNav
// 那一步才换出来（标注成 `SidebarSourceItem<SellerMessageKey>` 让写错的 key 在这里是编译错误）。
// 以前这里是中文 label + `nav.<key>` 现场拼，代价是 t 要被放宽成 (key: string) => string。
export const NAV_SOURCE_ITEMS: readonly SidebarSourceItem<SellerMessageKey>[] = [
    { key: "home", labelKey: "nav.home", icon: <HouseIcon />, to: "/" },
    {
        key: "trade",
        labelKey: "nav.trade",
        icon: <CalendarIcon />,
        sections: [
            {
                titleKey: "nav.trade.section.0",
                items: [
                    { key: "order", labelKey: "nav.trade.order", to: "/trade/order" },
                    {
                        key: "shipping",
                        labelKey: "nav.trade.shipping",
                        to: "/trade/shipping",
                    },
                    { key: "ship", labelKey: "nav.trade.ship", to: "/trade/ship" },
                    {
                        key: "logistics",
                        labelKey: "nav.trade.logistics",
                        to: "/trade/logistics",
                    },
                    { key: "refund", labelKey: "nav.trade.refund", to: "/trade/refund" },
                ],
            },
            {
                titleKey: "nav.trade.section.1",
                collapsible: true,
                items: [
                    { key: "review", labelKey: "nav.trade.review", to: "/trade/review" },
                    {
                        key: "buyershow",
                        labelKey: "nav.trade.buyershow",
                        to: "/trade/buyershow",
                    },
                ],
            },
        ],
    },
    {
        key: "product",
        labelKey: "nav.product",
        icon: <PackageIcon />,
        sections: [
            {
                titleKey: "nav.product.section.0",
                items: [
                    { key: "list", labelKey: "nav.product.list", to: "/product/list" },
                    {
                        key: "create",
                        labelKey: "nav.product.create",
                        to: "/product/create/category",
                    },
                    {
                        key: "category",
                        labelKey: "nav.product.category",
                        to: "/product/category",
                    },
                    { key: "stock", labelKey: "nav.product.stock", to: "/product/stock" },
                ],
            },
            {
                titleKey: "nav.product.section.1",
                collapsible: true,
                items: [
                    {
                        key: "supplier",
                        labelKey: "nav.product.supplier",
                        to: "/product/supplier",
                    },
                    {
                        key: "purchase",
                        labelKey: "nav.product.purchase",
                        to: "/product/purchase",
                    },
                    { key: "price", labelKey: "nav.product.price", to: "/product/price" },
                ],
            },
        ],
    },
    {
        key: "shop",
        labelKey: "nav.shop",
        icon: <StoreIcon />,
        sections: [
            {
                titleKey: "nav.shop.section.0",
                items: [
                    { key: "list", labelKey: "nav.shop.list", to: "/shop/list" },
                    { key: "address", labelKey: "nav.shop.address", to: "/shop/address" },
                    { key: "member", labelKey: "nav.shop.member", to: "/shop/member" },
                    {
                        key: "decoration",
                        labelKey: "nav.shop.decoration",
                        to: "/shop/decoration",
                    },
                    { key: "notice", labelKey: "nav.shop.notice", to: "/shop/notice" },
                ],
            },
            {
                titleKey: "nav.shop.section.1",
                collapsible: true,
                items: [
                    { key: "license", labelKey: "nav.shop.license", to: "/shop/license" },
                    { key: "brand", labelKey: "nav.shop.brand", to: "/shop/brand" },
                ],
            },
        ],
    },
    {
        key: "marketing",
        labelKey: "nav.marketing",
        icon: <MegaphoneIcon />,
        sections: [
            {
                titleKey: "nav.marketing.section.0",
                items: [
                    {
                        key: "campaign",
                        labelKey: "nav.marketing.campaign",
                        to: "/marketing/campaign",
                    },
                    {
                        key: "coupon",
                        labelKey: "nav.marketing.coupon",
                        to: "/marketing/coupon",
                    },
                    {
                        key: "flash",
                        labelKey: "nav.marketing.flash",
                        to: "/marketing/flash",
                    },
                ],
            },
        ],
    },
    {
        key: "service",
        labelKey: "nav.service",
        icon: <HeadsetIcon />,
        to: "/service",
        dividerAfter: true,
    },
    {
        key: "data",
        labelKey: "nav.data",
        icon: <ChartColumnIcon />,
        sections: [
            {
                titleKey: "nav.data.section.0",
                items: [
                    { key: "sales", labelKey: "nav.data.sales", to: "/analytics" },
                    {
                        key: "overview",
                        labelKey: "nav.data.overview",
                        to: "/data/overview",
                    },
                    { key: "report", labelKey: "nav.data.report", to: "/data/report" },
                    { key: "visit", labelKey: "nav.data.visit", to: "/data/visit" },
                ],
            },
        ],
    },
]

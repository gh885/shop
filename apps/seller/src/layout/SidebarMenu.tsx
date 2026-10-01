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
// 以前这里是中文 label + `seller.nav.<key>` 现场拼，代价是 t 要被放宽成 (key: string) => string。
export const NAV_SOURCE_ITEMS: readonly SidebarSourceItem<SellerMessageKey>[] = [
    { key: "home", labelKey: "seller.nav.home", icon: <HouseIcon />, to: "/" },
    {
        key: "trade",
        labelKey: "seller.nav.trade",
        icon: <CalendarIcon />,
        sections: [
            {
                titleKey: "seller.nav.trade.section.0",
                items: [
                    { key: "order", labelKey: "seller.nav.trade.order", to: "/trade/order" },
                    {
                        key: "shipping",
                        labelKey: "seller.nav.trade.shipping",
                        to: "/trade/shipping",
                    },
                    { key: "ship", labelKey: "seller.nav.trade.ship", to: "/trade/ship" },
                    {
                        key: "logistics",
                        labelKey: "seller.nav.trade.logistics",
                        to: "/trade/logistics",
                    },
                    { key: "refund", labelKey: "seller.nav.trade.refund", to: "/trade/refund" },
                ],
            },
            {
                titleKey: "seller.nav.trade.section.1",
                collapsible: true,
                items: [
                    { key: "review", labelKey: "seller.nav.trade.review", to: "/trade/review" },
                    {
                        key: "buyershow",
                        labelKey: "seller.nav.trade.buyershow",
                        to: "/trade/buyershow",
                    },
                ],
            },
        ],
    },
    {
        key: "product",
        labelKey: "seller.nav.product",
        icon: <PackageIcon />,
        sections: [
            {
                titleKey: "seller.nav.product.section.0",
                items: [
                    { key: "list", labelKey: "seller.nav.product.list", to: "/product/list" },
                    {
                        key: "create",
                        labelKey: "seller.nav.product.create",
                        to: "/product/create/category",
                    },
                    {
                        key: "category",
                        labelKey: "seller.nav.product.category",
                        to: "/product/category",
                    },
                    { key: "stock", labelKey: "seller.nav.product.stock", to: "/product/stock" },
                ],
            },
            {
                titleKey: "seller.nav.product.section.1",
                collapsible: true,
                items: [
                    {
                        key: "supplier",
                        labelKey: "seller.nav.product.supplier",
                        to: "/product/supplier",
                    },
                    {
                        key: "purchase",
                        labelKey: "seller.nav.product.purchase",
                        to: "/product/purchase",
                    },
                    { key: "price", labelKey: "seller.nav.product.price", to: "/product/price" },
                ],
            },
        ],
    },
    {
        key: "shop",
        labelKey: "seller.nav.shop",
        icon: <StoreIcon />,
        sections: [
            {
                titleKey: "seller.nav.shop.section.0",
                items: [
                    { key: "list", labelKey: "seller.nav.shop.list", to: "/shop/list" },
                    { key: "address", labelKey: "seller.nav.shop.address", to: "/shop/address" },
                    { key: "member", labelKey: "seller.nav.shop.member", to: "/shop/member" },
                    {
                        key: "decoration",
                        labelKey: "seller.nav.shop.decoration",
                        to: "/shop/decoration",
                    },
                    { key: "notice", labelKey: "seller.nav.shop.notice", to: "/shop/notice" },
                ],
            },
            {
                titleKey: "seller.nav.shop.section.1",
                collapsible: true,
                items: [
                    { key: "license", labelKey: "seller.nav.shop.license", to: "/shop/license" },
                    { key: "brand", labelKey: "seller.nav.shop.brand", to: "/shop/brand" },
                ],
            },
        ],
    },
    {
        key: "marketing",
        labelKey: "seller.nav.marketing",
        icon: <MegaphoneIcon />,
        sections: [
            {
                titleKey: "seller.nav.marketing.section.0",
                items: [
                    {
                        key: "campaign",
                        labelKey: "seller.nav.marketing.campaign",
                        to: "/marketing/campaign",
                    },
                    {
                        key: "coupon",
                        labelKey: "seller.nav.marketing.coupon",
                        to: "/marketing/coupon",
                    },
                    {
                        key: "flash",
                        labelKey: "seller.nav.marketing.flash",
                        to: "/marketing/flash",
                    },
                ],
            },
        ],
    },
    {
        key: "service",
        labelKey: "seller.nav.service",
        icon: <HeadsetIcon />,
        to: "/service",
        dividerAfter: true,
    },
    {
        key: "data",
        labelKey: "seller.nav.data",
        icon: <ChartColumnIcon />,
        sections: [
            {
                titleKey: "seller.nav.data.section.0",
                items: [
                    {
                        key: "overview",
                        labelKey: "seller.nav.data.overview",
                        to: "/data/overview",
                    },
                    { key: "report", labelKey: "seller.nav.data.report", to: "/data/report" },
                    { key: "visit", labelKey: "seller.nav.data.visit", to: "/data/visit" },
                ],
            },
        ],
    },
]

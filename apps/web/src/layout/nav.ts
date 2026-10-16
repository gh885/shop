import { SELLER_URL } from "#/shared/lib/external"

import type { WebMessageKey, WebParamsByKey, WebTranslate } from "#/locales/messages.gen"

export interface SiteNavSourceChild {
    labelKey: Exclude<WebMessageKey, keyof WebParamsByKey>
    to: string
    children?: SiteNavSourceChild[]
}

export interface SiteNavSourceItem {
    labelKey: Exclude<WebMessageKey, keyof WebParamsByKey>
    to?: string
    children?: SiteNavSourceChild[]
}

export interface SiteNavChildItem {
    label: string
    to: string
    children?: SiteNavChildItem[]
}

export interface SiteNavItem {
    label: string
    to?: string
    children?: SiteNavChildItem[]
}

export const SITE_NAV_ITEMS: readonly SiteNavSourceItem[] = [
    { labelKey: "nav.home", to: "/" },
    {
        labelKey: "nav.category",
        children: [
            {
                labelKey: "nav.apparel",
                to: "/categories/apparel",
                children: [
                    { labelKey: "nav.women", to: "/categories/apparel/women" },
                    { labelKey: "nav.men", to: "/categories/apparel/men" },
                    { labelKey: "nav.shoes", to: "/categories/apparel/shoes" },
                    { labelKey: "nav.bags", to: "/categories/apparel/bags" },
                ],
            },
            {
                labelKey: "nav.digital",
                to: "/categories/digital",
                children: [
                    { labelKey: "nav.phones", to: "/categories/digital/phones" },
                    { labelKey: "nav.computers", to: "/categories/digital/computers" },
                    { labelKey: "nav.appliances", to: "/categories/digital/appliances" },
                ],
            },
            {
                labelKey: "nav.beauty",
                to: "/categories/beauty",
                children: [
                    { labelKey: "nav.skincare", to: "/categories/beauty/skincare" },
                    { labelKey: "nav.makeup", to: "/categories/beauty/makeup" },
                    { labelKey: "nav.personalCare", to: "/categories/beauty/personal-care" },
                ],
            },
            {
                labelKey: "nav.homeCategory",
                to: "/categories/home",
                children: [
                    { labelKey: "nav.furniture", to: "/categories/home/furniture" },
                    { labelKey: "nav.textiles", to: "/categories/home/textiles" },
                    { labelKey: "nav.kitchen", to: "/categories/home/kitchen" },
                ],
            },
            {
                labelKey: "nav.food",
                to: "/categories/food",
                children: [
                    { labelKey: "nav.snacks", to: "/categories/food/snacks" },
                    { labelKey: "nav.fresh", to: "/categories/food/fresh" },
                    { labelKey: "nav.drinks", to: "/categories/food/drinks" },
                ],
            },
            {
                labelKey: "nav.baby",
                to: "/categories/baby",
                children: [
                    { labelKey: "nav.formula", to: "/categories/baby/formula" },
                    { labelKey: "nav.diapers", to: "/categories/baby/diapers" },
                    { labelKey: "nav.toys", to: "/categories/baby/toys" },
                ],
            },
        ],
    },
    {
        labelKey: "nav.sell",
        children: [
            { labelKey: "nav.openShop", to: "/sell" },
            { labelKey: "nav.sellerCenter", to: SELLER_URL },
        ],
    },
]

export function translateNavItems(
    items: readonly SiteNavSourceItem[],
    t: WebTranslate,
): SiteNavItem[] {
    // 递归写成闭包而不是模块级函数：t 是每次渲染传进来的，挂在模块上就成了跨请求的进程级状态
    const translateChild = (child: SiteNavSourceChild): SiteNavChildItem => ({
        label: t(child.labelKey),
        to: child.to,
        children: child.children?.map(translateChild),
    })
    return items.map((item) => ({
        label: t(item.labelKey),
        to: item.to,
        children: item.children?.map(translateChild),
    }))
}

export function isNavGroupActive(pathname: string, item: SiteNavItem): boolean {
    return item.children?.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`)) ?? false
}

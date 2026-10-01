import { SELLER_URL } from "#/shared/lib/external"

import type { WebMessageKey, WebTranslate } from "#/locales/messages.gen"

/**
 * 顶部主导航的数据与规则——菜单树、i18n 对照、以及「哪一项算当前项」。
 *
 * 住在 .ts 是因为这三样都不需要 React：换一套菜单树或改一条对照表，
 * 应该能在 node 里断言，而不是必须挂载 SiteNav 再 jsdom 里点。
 */

/**
 * 菜单**源**项：写的是 i18n key，句子在 `translateNavItems` 那一步换出来。
 *
 * 一级项的 `to` 可缺（它可以只是个分组），往下两层必须有目标——`NavLink` 的 `to` 不接受
 * undefined，这条边界在类型上就写着，省掉渲染处那两个 `?? "/"`。
 */
export interface SiteNavSourceChild {
    labelKey: WebMessageKey
    /** 目标路由；分类等页面未落地前先写占位路径，NavLink 里按字符串透传 */
    to: string
    children?: SiteNavSourceChild[]
}

export interface SiteNavSourceItem {
    labelKey: WebMessageKey
    to?: string
    children?: SiteNavSourceChild[]
}

/** 已翻译的菜单项：`label` 是当前语言的句子 */
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

/**
 * 菜单树。
 *
 * 以前这里是中文 label 加一张 `NAV_LABEL_KEYS: Record<string, string>` 对照表，代价有三：
 * 取值域是 `string`，于是 `t` 只能被放宽成 `(key: string) => string`；漏登记的项静默露出中文；
 * 登记表与菜单树分两处，改一处忘另一处不会红。改成每项自带 `labelKey`（标注即门禁，写错 key
 * 编译不过）之后，那张表与那处放宽一起没了（i18n.md §5.5 口子 2）。
 */
export const SITE_NAV_ITEMS: readonly SiteNavSourceItem[] = [
    { labelKey: "web.nav.home", to: "/" },
    {
        labelKey: "web.nav.category",
        // TODO: 分类浏览页尚未实现，to 均为占位路径，落地后接真实路由
        children: [
            {
                labelKey: "web.nav.apparel",
                to: "/categories/apparel",
                children: [
                    { labelKey: "web.nav.women", to: "/categories/apparel/women" },
                    { labelKey: "web.nav.men", to: "/categories/apparel/men" },
                    { labelKey: "web.nav.shoes", to: "/categories/apparel/shoes" },
                    { labelKey: "web.nav.bags", to: "/categories/apparel/bags" },
                ],
            },
            {
                labelKey: "web.nav.digital",
                to: "/categories/digital",
                children: [
                    { labelKey: "web.nav.phones", to: "/categories/digital/phones" },
                    { labelKey: "web.nav.computers", to: "/categories/digital/computers" },
                    { labelKey: "web.nav.appliances", to: "/categories/digital/appliances" },
                ],
            },
            {
                labelKey: "web.nav.beauty",
                to: "/categories/beauty",
                children: [
                    { labelKey: "web.nav.skincare", to: "/categories/beauty/skincare" },
                    { labelKey: "web.nav.makeup", to: "/categories/beauty/makeup" },
                    { labelKey: "web.nav.personalCare", to: "/categories/beauty/personal-care" },
                ],
            },
            {
                labelKey: "web.nav.homeCategory",
                to: "/categories/home",
                children: [
                    { labelKey: "web.nav.furniture", to: "/categories/home/furniture" },
                    { labelKey: "web.nav.textiles", to: "/categories/home/textiles" },
                    { labelKey: "web.nav.kitchen", to: "/categories/home/kitchen" },
                ],
            },
            {
                labelKey: "web.nav.food",
                to: "/categories/food",
                children: [
                    { labelKey: "web.nav.snacks", to: "/categories/food/snacks" },
                    { labelKey: "web.nav.fresh", to: "/categories/food/fresh" },
                    { labelKey: "web.nav.drinks", to: "/categories/food/drinks" },
                ],
            },
            {
                labelKey: "web.nav.baby",
                to: "/categories/baby",
                children: [
                    { labelKey: "web.nav.formula", to: "/categories/baby/formula" },
                    { labelKey: "web.nav.diapers", to: "/categories/baby/diapers" },
                    { labelKey: "web.nav.toys", to: "/categories/baby/toys" },
                ],
            },
        ],
    },
    {
        labelKey: "web.nav.sell",
        children: [
            { labelKey: "web.nav.openShop", to: "/sell" },
            // 店铺/店员/商品管理已迁到卖家中心（apps/seller 独立 SPA）
            { labelKey: "web.nav.sellerCenter", to: SELLER_URL },
        ],
    },
]

/**
 * 三层菜单逐层翻译（一级 / 二级 / 三级各带句子），不改 to、不补空 children。
 *
 * `t` 是类型化的 `WebTranslate`：key 位收在生成物那份联合上，所以「往菜单里写一个 catalog
 * 里没有的 key」在 `SITE_NAV_ITEMS` 的标注处就编译不过，不必等运行时回退。
 */
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

/**
 * 下拉组的高亮判据：任一二级项命中当前路径就算激活。
 *
 * 精确或「子路径」都算（`/categories/digital` 命中 `/categories/digital/phones`），
 * 二级本身还没有落地页时，用户停在三级上也该知道自己是从这个组来的。
 */
export function isNavGroupActive(pathname: string, item: SiteNavItem): boolean {
    return item.children?.some((c) => pathname === c.to || pathname.startsWith(`${c.to}/`)) ?? false
}

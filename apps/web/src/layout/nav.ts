import { SELLER_URL } from "#/shared/lib/external"

/**
 * 顶部主导航的数据与规则——菜单树、i18n 对照、以及「哪一项算当前项」。
 *
 * 住在 .ts 是因为这三样都不需要 React：换一套菜单树或改一条对照表，
 * 应该能在 node 里断言，而不是必须挂载 SiteNav 再 jsdom 里点。
 */

/** 二级导航项：hover 一级项展开下拉，悬停带 children 的项再右弹二级 */
export interface SiteNavChildItem {
    label: string
    /** 目标路由；分类等页面未落地前先写占位路径，NavLink 里按字符串透传 */
    to: string
    children?: SiteNavChildItem[]
}

export interface SiteNavItem {
    label: string
    to?: string
    children?: SiteNavChildItem[]
}

export const SITE_NAV_ITEMS: SiteNavItem[] = [
    { label: "首页", to: "/" },
    {
        label: "商品分类",
        // TODO: 分类浏览页尚未实现，to 均为占位路径，落地后接真实路由
        children: [
            {
                label: "服饰鞋包",
                to: "/categories/apparel",
                children: [
                    { label: "女装", to: "/categories/apparel/women" },
                    { label: "男装", to: "/categories/apparel/men" },
                    { label: "鞋靴", to: "/categories/apparel/shoes" },
                    { label: "箱包", to: "/categories/apparel/bags" },
                ],
            },
            {
                label: "数码家电",
                to: "/categories/digital",
                children: [
                    { label: "手机", to: "/categories/digital/phones" },
                    { label: "电脑办公", to: "/categories/digital/computers" },
                    { label: "家用电器", to: "/categories/digital/appliances" },
                ],
            },
            {
                label: "美妆个护",
                to: "/categories/beauty",
                children: [
                    { label: "护肤", to: "/categories/beauty/skincare" },
                    { label: "彩妆", to: "/categories/beauty/makeup" },
                    { label: "个人护理", to: "/categories/beauty/personal-care" },
                ],
            },
            {
                label: "家居家装",
                to: "/categories/home",
                children: [
                    { label: "家具", to: "/categories/home/furniture" },
                    { label: "家纺", to: "/categories/home/textiles" },
                    { label: "厨具", to: "/categories/home/kitchen" },
                ],
            },
            {
                label: "食品生鲜",
                to: "/categories/food",
                children: [
                    { label: "休闲零食", to: "/categories/food/snacks" },
                    { label: "生鲜果蔬", to: "/categories/food/fresh" },
                    { label: "酒水饮料", to: "/categories/food/drinks" },
                ],
            },
            {
                label: "母婴玩具",
                to: "/categories/baby",
                children: [
                    { label: "奶粉辅食", to: "/categories/baby/formula" },
                    { label: "纸尿裤", to: "/categories/baby/diapers" },
                    { label: "玩具", to: "/categories/baby/toys" },
                ],
            },
        ],
    },
    {
        label: "开店入驻",
        children: [
            { label: "我要开店", to: "/sell" },
            // 店铺/店员/商品管理已迁到卖家中心（apps/seller 独立 SPA）
            { label: "卖家中心", to: SELLER_URL },
        ],
    },
]

/**
 * 菜单树里的中文 label → i18n key。
 *
 * 以中文为键而不是给每项加 `key` 字段：菜单树读起来就是给人看的，多一列 key 会先于漏翻译出问题。
 * 没登记的 label 原样当 key 交给 `t`（缺译文时回退到 key 本身），所以这张表漏项不会白屏，只会露出中文。
 */
export const NAV_LABEL_KEYS: Record<string, string> = {
    首页: "web.nav.home",
    商品分类: "web.nav.category",
    服饰鞋包: "web.nav.apparel",
    女装: "web.nav.women",
    男装: "web.nav.men",
    鞋靴: "web.nav.shoes",
    箱包: "web.nav.bags",
    数码家电: "web.nav.digital",
    手机: "web.nav.phones",
    电脑办公: "web.nav.computers",
    家用电器: "web.nav.appliances",
    美妆个护: "web.nav.beauty",
    护肤: "web.nav.skincare",
    彩妆: "web.nav.makeup",
    个人护理: "web.nav.personalCare",
    家居家装: "web.nav.homeCategory",
    家具: "web.nav.furniture",
    家纺: "web.nav.textiles",
    厨具: "web.nav.kitchen",
    食品生鲜: "web.nav.food",
    休闲零食: "web.nav.snacks",
    生鲜果蔬: "web.nav.fresh",
    酒水饮料: "web.nav.drinks",
    母婴玩具: "web.nav.baby",
    奶粉辅食: "web.nav.formula",
    纸尿裤: "web.nav.diapers",
    玩具: "web.nav.toys",
    开店入驻: "web.nav.sell",
    我要开店: "web.nav.openShop",
    卖家中心: "web.nav.sellerCenter",
}

/** 三层菜单逐层翻译（一级 / 二级 / 三级各带 label），不改 to、不补空 children */
export function translateNavItems(items: SiteNavItem[], t: (key: string) => string): SiteNavItem[] {
    return items.map((item) => ({
        ...item,
        label: t(NAV_LABEL_KEYS[item.label] ?? item.label),
        children: item.children?.map((child) => ({
            ...child,
            label: t(NAV_LABEL_KEYS[child.label] ?? child.label),
            children: child.children?.map((leaf) => ({
                ...leaf,
                label: t(NAV_LABEL_KEYS[leaf.label] ?? leaf.label),
            })),
        })),
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

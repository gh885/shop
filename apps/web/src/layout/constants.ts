import { SELLER_URL } from "#/shared/lib/external"

/**
 * `as const` 是必需的——它把 `to` 收成字面量类型，SiteFooter 里「站内路由喂给 Link、
 * 外链喂给 a」的分支才过得了 routeTree 的类型约束。加一组链接时别顺手删掉。
 */
export const FOOTER_GROUPS = [
    {
        titleKey: "footer.group.shopping",
        links: [{ labelKey: "footer.home", to: "/" }],
    },
    {
        titleKey: "footer.group.selling",
        links: [
            { labelKey: "footer.openShop", to: "/sell" },
            { labelKey: "footer.sellerCenter", to: SELLER_URL },
        ],
    },
] as const
